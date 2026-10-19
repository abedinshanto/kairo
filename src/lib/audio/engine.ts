// Ambient soundscape mixer + timer chimes, built on the Web Audio API.

import type { ChimeId } from "../types";
import {
  fillBrown,
  fillFire,
  fillForest,
  fillNight,
  fillOcean,
  fillPink,
  fillRain,
  fillStream,
  fillWhite,
  renderLoop,
  renderThunder,
} from "./synth";

export type SoundId =
  | "rain" | "thunder" | "ocean" | "wind" | "fire" | "stream" | "forest" | "night"
  | "white" | "pink" | "brown" | "binaural" | "drone";

export interface SoundMeta {
  id: SoundId;
  label: string;
  group: "Nature" | "Noise" | "Tones";
  hint: string;
}

export const SOUNDS: SoundMeta[] = [
  { id: "rain", label: "Rain", group: "Nature", hint: "Steady rainfall" },
  { id: "thunder", label: "Thunder", group: "Nature", hint: "Distant, rolling storms" },
  { id: "ocean", label: "Ocean", group: "Nature", hint: "Slow waves on the shore" },
  { id: "wind", label: "Wind", group: "Nature", hint: "Soft gusts" },
  { id: "fire", label: "Fireplace", group: "Nature", hint: "Crackling logs" },
  { id: "stream", label: "Stream", group: "Nature", hint: "Bubbling brook" },
  { id: "forest", label: "Forest", group: "Nature", hint: "Birdsong and leaves" },
  { id: "night", label: "Night", group: "Nature", hint: "Crickets at dusk" },
  { id: "white", label: "White noise", group: "Noise", hint: "Masks speech and clatter" },
  { id: "pink", label: "Pink noise", group: "Noise", hint: "Balanced and soft" },
  { id: "brown", label: "Brown noise", group: "Noise", hint: "Deep, warm rumble" },
  { id: "binaural", label: "Binaural β", group: "Tones", hint: "14 Hz beat · use headphones" },
  { id: "drone", label: "Deep space", group: "Tones", hint: "Evolving ambient pad" },
];

export interface Preset {
  id: string;
  name: string;
  description: string;
  levels: Partial<Record<SoundId, number>>;
}

export const PRESETS: Preset[] = [
  { id: "deep-work", name: "Deep Work", description: "Brown noise with light rain", levels: { brown: 0.55, rain: 0.3 } },
  { id: "rainy-night", name: "Rainy Night", description: "Rain, distant thunder, a fire", levels: { rain: 0.7, thunder: 0.4, fire: 0.25 } },
  { id: "ocean-calm", name: "Ocean Calm", description: "Waves and a sea breeze", levels: { ocean: 0.75, wind: 0.2 } },
  { id: "forest", name: "Forest Morning", description: "Birdsong by a stream", levels: { forest: 0.6, stream: 0.4, wind: 0.15 } },
  { id: "campfire", name: "Campfire", description: "Crackling fire, crickets", levels: { fire: 0.7, night: 0.45 } },
  { id: "flow", name: "Flow State", description: "Binaural beats over a soft pad", levels: { binaural: 0.45, drone: 0.4, pink: 0.15 } },
];

/** Per-sound loudness trim so presets sit at similar volumes. */
const TRIM: Record<SoundId, number> = {
  rain: 0.9, thunder: 1.1, ocean: 0.9, wind: 0.9, fire: 1.0, stream: 0.7, forest: 1.1, night: 1.0,
  white: 0.35, pink: 0.7, brown: 0.8, binaural: 0.22, drone: 0.5,
};

interface Channel {
  gain: GainNode;
  stop(): void;
}

type Listener = () => void;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private channels = new Map<SoundId, Channel>();
  private buffers = new Map<string, AudioBuffer>();
  private levels: Partial<Record<SoundId, number>> = {};
  private masterLevel = 0.7;
  private listeners = new Set<Listener>();
  private suspendTimer: number | undefined;
  playing = false;

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: "playback" });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp).connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  setLevels(levels: Partial<Record<SoundId, number>>) {
    this.levels = { ...levels };
    if (this.playing) this.sync();
  }

  setMaster(v: number) {
    this.masterLevel = v;
    if (this.playing && this.ctx && this.master) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
    }
  }

  get hasMix() {
    return Object.values(this.levels).some((v) => (v ?? 0) > 0);
  }

  async play() {
    const ctx = this.ensure();
    window.clearTimeout(this.suspendTimer);
    await ctx.resume();
    this.playing = true;
    this.sync();
    const g = this.master!.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(this.masterLevel, ctx.currentTime + 1.5);
    this.notify();
  }

  pause() {
    if (!this.ctx || !this.master || !this.playing) return;
    const ctx = this.ctx;
    this.playing = false;
    const g = this.master.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    this.suspendTimer = window.setTimeout(() => {
      if (this.playing) return;
      this.channels.forEach((c) => c.stop());
      this.channels.clear();
      void ctx.suspend();
    }, 900);
    this.notify();
  }

  toggle() {
    return this.playing ? this.pause() : this.play();
  }

  private sync() {
    const ctx = this.ctx!;
    for (const meta of SOUNDS) {
      const level = this.levels[meta.id] ?? 0;
      const existing = this.channels.get(meta.id);
      const target = level * level * TRIM[meta.id];
      if (level > 0) {
        const ch = existing ?? this.start(meta.id);
        ch.gain.gain.setTargetAtTime(target, ctx.currentTime, existing ? 0.12 : 0.6);
      } else if (existing) {
        existing.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        this.channels.delete(meta.id);
        window.setTimeout(() => existing.stop(), 900);
      }
    }
  }

  private loop(key: string, seconds: number, fill: Parameters<typeof renderLoop>[2]): AudioBuffer {
    let buf = this.buffers.get(key);
    if (!buf) {
      buf = renderLoop(this.ctx!, seconds, fill);
      this.buffers.set(key, buf);
    }
    return buf;
  }

  private start(id: SoundId): Channel {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master!);
    const stops: (() => void)[] = [];

    const playBuffer = (buf: AudioBuffer, dest: AudioNode = gain) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(dest);
      // Random offset so stacked loops never line up.
      src.start(0, Math.random() * buf.duration);
      stops.push(() => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        src.disconnect();
      });
    };

    switch (id) {
      case "white":
        playBuffer(this.loop("white", 6, fillWhite));
        break;
      case "pink":
        playBuffer(this.loop("pink", 6, fillPink));
        break;
      case "brown":
        playBuffer(this.loop("brown", 8, fillBrown));
        break;
      case "rain":
        playBuffer(this.loop("rain", 12, fillRain));
        break;
      case "ocean":
        playBuffer(this.loop("ocean", 26, fillOcean));
        break;
      case "fire":
        playBuffer(this.loop("fire", 14, fillFire));
        break;
      case "stream":
        playBuffer(this.loop("stream", 10, fillStream));
        break;
      case "forest":
        playBuffer(this.loop("forest", 34, fillForest));
        break;
      case "night":
        playBuffer(this.loop("night", 14, fillNight));
        break;
      case "wind": {
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 520;
        filter.Q.value = 0.8;
        const amp = ctx.createGain();
        amp.gain.value = 0.9;
        filter.connect(amp).connect(gain);
        playBuffer(this.loop("pink", 6, fillPink), filter);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = 260;
        lfo.connect(lfoDepth).connect(filter.frequency);
        const gust = ctx.createOscillator();
        gust.frequency.value = 0.113;
        const gustDepth = ctx.createGain();
        gustDepth.gain.value = 0.45;
        gust.connect(gustDepth).connect(amp.gain);
        lfo.start();
        gust.start();
        stops.push(() => {
          lfo.stop();
          gust.stop();
          filter.disconnect();
          amp.disconnect();
        });
        break;
      }
      case "thunder": {
        const variants = [0, 1, 2].map((i) => {
          const key = `thunder-${i}`;
          let buf = this.buffers.get(key);
          if (!buf) {
            buf = renderThunder(ctx);
            this.buffers.set(key, buf);
          }
          return buf;
        });
        let timer = 0;
        const strike = () => {
          const src = ctx.createBufferSource();
          src.buffer = variants[Math.floor(Math.random() * variants.length)];
          src.playbackRate.value = 0.8 + Math.random() * 0.4;
          const pan = ctx.createStereoPanner();
          pan.pan.value = Math.random() * 1.2 - 0.6;
          src.connect(pan).connect(gain);
          src.start();
          src.onended = () => pan.disconnect();
          timer = window.setTimeout(strike, 14_000 + Math.random() * 30_000);
        };
        timer = window.setTimeout(strike, 1500 + Math.random() * 4000);
        stops.push(() => window.clearTimeout(timer));
        break;
      }
      case "binaural": {
        const merger = ctx.createChannelMerger(2);
        const left = ctx.createOscillator();
        const right = ctx.createOscillator();
        left.frequency.value = 200;
        right.frequency.value = 214;
        left.connect(merger, 0, 0);
        right.connect(merger, 0, 1);
        merger.connect(gain);
        left.start();
        right.start();
        stops.push(() => {
          left.stop();
          right.stop();
          merger.disconnect();
        });
        break;
      }
      case "drone": {
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 900;
        filter.Q.value = 0.6;
        filter.connect(gain);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.045;
        const depth = ctx.createGain();
        depth.gain.value = 380;
        lfo.connect(depth).connect(filter.frequency);
        lfo.start();
        const voices = [110, 164.81, 220, 277.18, 329.63].map((f, i) => {
          const o = ctx.createOscillator();
          o.type = i % 2 ? "sine" : "triangle";
          o.frequency.value = f;
          o.detune.value = (Math.random() - 0.5) * 12;
          const g = ctx.createGain();
          g.gain.value = 0.22 / (i + 1);
          o.connect(g).connect(filter);
          o.start();
          return o;
        });
        stops.push(() => {
          lfo.stop();
          voices.forEach((v) => v.stop());
          filter.disconnect();
        });
        break;
      }
    }

    const channel: Channel = {
      gain,
      stop: () => {
        stops.forEach((s) => s());
        gain.disconnect();
      },
    };
    this.channels.set(id, channel);
    return channel;
  }

  /** A short cue when a phase ends. `rising` for "back to work", falling for "break time". */
  async chime(kind: ChimeId, volume: number, rising = false) {
    if (kind === "none" || volume <= 0) return;
    const ctx = this.ensure();
    window.clearTimeout(this.suspendTimer);
    await ctx.resume();
    const out = ctx.createGain();
    out.gain.value = volume * 0.5;
    out.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.05;

    const tone = (freq: number, at: number, decay: number, type: OscillatorType = "sine", amp = 1) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(amp, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + decay + 0.05);
    };

    if (kind === "bell") {
      const strike = (f: number, at: number) => {
        [
          [1, 1, 2.6],
          [2.0, 0.45, 1.6],
          [2.76, 0.32, 1.1],
          [5.4, 0.12, 0.6],
        ].forEach(([ratio, amp, decay]) => tone(f * ratio, at, decay, "sine", amp * 0.5));
      };
      const notes = rising ? [587.33, 880] : [880, 587.33];
      strike(notes[0], t0);
      strike(notes[1], t0 + 0.42);
    } else if (kind === "soft") {
      const notes = rising ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25];
      notes.forEach((f, i) => {
        tone(f, t0 + i * 0.16, 0.9, "sine", 0.6);
        tone(f * 4, t0 + i * 0.16, 0.12, "sine", 0.08);
      });
    } else {
      const notes = rising ? [880, 1174.66] : [1174.66, 880];
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      lp.connect(out);
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        const g = ctx.createGain();
        const at = t0 + i * 0.18;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.18, at + 0.005);
        g.gain.setValueAtTime(0.18, at + 0.09);
        g.gain.linearRampToValueAtTime(0, at + 0.11);
        o.connect(g).connect(lp);
        o.start(at);
        o.stop(at + 0.15);
      });
    }

    window.setTimeout(() => {
      out.disconnect();
      if (!this.playing && this.ctx) {
        this.suspendTimer = window.setTimeout(() => !this.playing && this.ctx?.suspend(), 1000);
      }
    }, 3500);
  }
}

export const soundEngine = new SoundEngine();
