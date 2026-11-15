// Ambient soundscape mixer + timer chimes, built on the Web Audio API.
//
// Loops are synthesised in a worker (see synth.ts) and cached; live sounds
// (wind, binaural beats, the pad) are made of oscillators and filters. All of
// it goes through one master gain and a gentle compressor. Chimes bypass the
// master, so they ring even while the soundscape is paused.

import type { ChimeId } from "../types";
import { renderSound } from "./synth";

export type SoundId =
  | "rain" | "thunder" | "ocean" | "wind" | "fire" | "stream" | "forest" | "night"
  | "cafe" | "train" | "library"
  | "white" | "pink" | "brown" | "binaural" | "drone";

export interface SoundMeta {
  id: SoundId;
  label: string;
  group: "Nature" | "Places" | "Noise" | "Tones";
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
  { id: "cafe", label: "Café", group: "Places", hint: "Murmured chatter, cups and spoons" },
  { id: "train", label: "Train", group: "Places", hint: "Wheels on the rails, a gentle sway" },
  { id: "library", label: "Library", group: "Places", hint: "Turning pages, quiet footsteps" },
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
  { id: "deep-work", name: "Deep Work", description: "Brown noise, light rain", levels: { brown: 0.6, rain: 0.35 } },
  { id: "rainy-night", name: "Rainy Night", description: "Rain, thunder, a fire", levels: { rain: 0.65, thunder: 0.45, fire: 0.35 } },
  { id: "ocean-calm", name: "Ocean Calm", description: "Waves, a sea breeze", levels: { ocean: 0.7, wind: 0.3 } },
  { id: "forest", name: "Forest Morning", description: "Birdsong by a stream", levels: { forest: 0.6, stream: 0.4, wind: 0.2 } },
  { id: "campfire", name: "Campfire", description: "Crackling fire, crickets", levels: { fire: 0.6, night: 0.5 } },
  { id: "flow", name: "Flow State", description: "Binaural beats, soft pad", levels: { binaural: 0.5, drone: 0.5, pink: 0.25 } },
  { id: "corner-cafe", name: "Corner Café", description: "Chatter, rain outside", levels: { cafe: 0.6, rain: 0.3 } },
  { id: "night-train", name: "Night Train", description: "Rails, rain on glass", levels: { train: 0.6, rain: 0.35 } },
  { id: "library", name: "Reading Room", description: "Pages, soft air", levels: { library: 0.65, brown: 0.3 } },
];

/** The preset a mix is, if any: the same sounds, at about the same levels. */
export function presetFor(levels: Partial<Record<string, number>>): Preset | undefined {
  const on = Object.keys(levels).filter((k) => (levels[k] ?? 0) > 0);
  return PRESETS.find((p) => {
    const keys = Object.keys(p.levels);
    return keys.length === on.length && keys.every((k) => Math.abs((levels[k] ?? 0) - (p.levels[k as SoundId] ?? 0)) < 0.2);
  });
}

/**
 * Per-sound trim on top of the shared loudness. Loops are already rendered to
 * the same loudness (-20 LUFS); the live sounds are set to match it (measured
 * offline), then a little taste: white noise and pure tones tire the ear sooner.
 */
const TRIM: Record<SoundId, number> = {
  rain: 1, thunder: 0.9, ocean: 1, wind: 1.45, fire: 1, stream: 1, forest: 1, night: 1,
  cafe: 1, train: 1, library: 1,
  white: 0.8, pink: 1, brown: 1, binaural: 0.11, drone: 0.72,
};

/** Rendered loops kept around (bytes); the least recently used go first. */
const CACHE_BUDGET = 64 * 1024 * 1024;

interface Channel {
  gain: GainNode;
  stopped: boolean;
  stop(): void;
}

interface Cached {
  buffer: AudioBuffer;
  used: number;
}

type Listener = () => void;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private channels = new Map<SoundId, Channel>();
  private cache = new Map<string, Cached>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private levels: Partial<Record<SoundId, number>> = {};
  private masterLevel = 0.7;
  private listeners = new Set<Listener>();
  /** Stops the channels once the fade-out has finished. */
  private idleTimer: number | undefined;
  /** Suspends the context (saves CPU and battery) once nothing is sounding. */
  private suspendTimer: number | undefined;
  /** A chime is ringing until then (performance.now()), so don't suspend before. */
  private chimeUntil = 0;
  private worker: Worker | null | undefined;
  private requests = new Map<number, { resolve: (c: Float32Array[]) => void; reject: (e: unknown) => void }>();
  private nextRequest = 1;
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

  /**
   * Call from a user gesture (a click or key press). Browsers and WebKit only
   * let audio start in response to one, and a chime at the end of a block
   * comes without one: unlocking early lets it ring.
   */
  unlock() {
    const ctx = this.ensure();
    if (ctx.state === "running") return;
    void ctx
      .resume()
      .then(() => this.maybeSuspend())
      .catch(() => {});
    this.prewarm(Object.keys(this.levels) as SoundId[]);
  }

  setLevels(levels: Partial<Record<SoundId, number>>) {
    this.levels = { ...levels };
    if (!this.playing) return;
    // Nothing left in the mix: stop, rather than "play" silence.
    if (!this.hasMix) this.pause();
    else this.sync();
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
    if (this.playing || !this.hasMix) return;
    const ctx = this.ensure();
    // Playing from now on, even before the context has resumed: a pause in
    // the meantime must win.
    this.playing = true;
    this.cancelIdle();
    this.notify();
    this.sync();
    const g = this.master!.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(this.masterLevel, ctx.currentTime + 1.2);
    try {
      await ctx.resume();
    } catch {
      /* not allowed yet: it starts with the next gesture */
    }
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.notify();
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const g = this.master.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (this.playing) return;
      this.channels.forEach((c) => c.stop());
      this.channels.clear();
      this.maybeSuspend();
    }, 950);
  }

  toggle() {
    return this.playing ? this.pause() : this.play();
  }

  private cancelIdle() {
    window.clearTimeout(this.idleTimer);
    window.clearTimeout(this.suspendTimer);
    this.idleTimer = undefined;
  }

  /** Suspend the context once nothing is playing or ringing. */
  private maybeSuspend() {
    window.clearTimeout(this.suspendTimer);
    if (!this.ctx || this.playing || this.ctx.state !== "running") return;
    const wait = this.chimeUntil - performance.now();
    if (wait > 0) {
      this.suspendTimer = window.setTimeout(() => this.maybeSuspend(), wait + 50);
      return;
    }
    void this.ctx.suspend().catch(() => {});
  }

  private sync() {
    const ctx = this.ctx!;
    for (const meta of SOUNDS) {
      const level = this.levels[meta.id] ?? 0;
      const existing = this.channels.get(meta.id);
      const target = level * level * TRIM[meta.id];
      if (level > 0) {
        const ch = existing ?? this.start(meta.id);
        ch.gain.gain.setTargetAtTime(target, ctx.currentTime, existing ? 0.12 : 0.5);
      } else if (existing) {
        existing.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        this.channels.delete(meta.id);
        window.setTimeout(() => existing.stop(), 900);
      }
    }
  }

  // ---------------------------------------------------------------- Rendering

  /** Ask the worker (or, without one, this thread) for a rendered loop. */
  private render(key: string, sampleRate: number): Promise<Float32Array[]> {
    if (this.worker === undefined) {
      try {
        this.worker = new Worker(new URL("./synth.worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = (e: MessageEvent<{ id: number; channels?: Float32Array[]; error?: string }>) => {
          const req = this.requests.get(e.data.id);
          if (!req) return;
          this.requests.delete(e.data.id);
          if (e.data.channels) req.resolve(e.data.channels);
          else req.reject(new Error(e.data.error ?? "render failed"));
        };
        this.worker.onerror = () => {
          // The worker couldn't start: render here from now on.
          this.worker?.terminate();
          this.worker = null;
          const waiting = [...this.requests.values()];
          this.requests.clear();
          waiting.forEach((r) => r.reject(new Error("worker failed")));
        };
      } catch {
        this.worker = null;
      }
    }
    const worker = this.worker;
    if (!worker) {
      // Let the click that asked for it paint first.
      return new Promise((resolve, reject) =>
        window.setTimeout(() => {
          try {
            resolve(renderSound(key, sampleRate));
          } catch (e) {
            reject(e);
          }
        }, 16),
      );
    }
    const id = this.nextRequest++;
    return new Promise<Float32Array[]>((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      worker.postMessage({ id, key, sampleRate });
    }).catch(() => renderSound(key, sampleRate));
  }

  private buffer(key: string): Promise<AudioBuffer> {
    const ctx = this.ensure();
    const hit = this.cache.get(key);
    if (hit) {
      hit.used = performance.now();
      return Promise.resolve(hit.buffer);
    }
    let job = this.pending.get(key);
    if (!job) {
      job = this.render(key, ctx.sampleRate)
        .then((channels) => {
          const buffer = ctx.createBuffer(channels.length, channels[0].length, ctx.sampleRate);
          channels.forEach((data, i) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, i));
          this.cache.set(key, { buffer, used: performance.now() });
          this.evict();
          return buffer;
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, job);
    }
    return job;
  }

  /** Forget the least recently used loops that aren't playing, past the budget. */
  private evict() {
    const size = (b: AudioBuffer) => b.length * b.numberOfChannels * 4;
    let total = 0;
    this.cache.forEach((c) => (total += size(c.buffer)));
    if (total <= CACHE_BUDGET) return;
    const live = new Set<string>();
    this.channels.forEach((_, id) => {
      live.add(id === "wind" ? "pink" : id);
      if (id === "thunder") [0, 1, 2].forEach((i) => live.add(`thunder-${i}`));
    });
    const old = [...this.cache.entries()].filter(([k]) => !live.has(k)).sort((a, b) => a[1].used - b[1].used);
    for (const [key, c] of old) {
      if (total <= CACHE_BUDGET) break;
      this.cache.delete(key);
      total -= size(c.buffer);
    }
  }

  /** Render these sounds' loops ahead of time (in the worker), so play starts at once. */
  prewarm(ids: SoundId[]) {
    if (!this.ctx) return;
    for (const id of ids) {
      if (id === "thunder") [0, 1, 2].forEach((i) => void this.buffer(`thunder-${i}`).catch(() => {}));
      else if (id !== "wind" && id !== "binaural" && id !== "drone") void this.buffer(id).catch(() => {});
    }
  }

  // ---------------------------------------------------------------- Channels

  private start(id: SoundId): Channel {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master!);
    const stops: (() => void)[] = [];
    const channel: Channel = {
      gain,
      stopped: false,
      stop: () => {
        if (channel.stopped) return;
        channel.stopped = true;
        stops.forEach((s) => {
          try {
            s();
          } catch {
            /* already stopped */
          }
        });
        gain.disconnect();
      },
    };

    /** Loop a rendered buffer into `dest`, fading in once it's ready. */
    const loop = (key: string, dest: AudioNode = gain) => {
      void this.buffer(key)
        .then((buf) => {
          if (channel.stopped) return;
          const fade = ctx.createGain();
          fade.gain.value = 0;
          fade.connect(dest);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.connect(fade);
          // A random offset, so loops stacked in a mix never line up the same way twice.
          src.start(0, Math.random() * buf.duration);
          fade.gain.setTargetAtTime(1, ctx.currentTime, 0.25);
          stops.push(() => {
            src.stop();
            src.disconnect();
            fade.disconnect();
          });
        })
        .catch(() => {});
    };

    switch (id) {
      case "wind": {
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 520;
        filter.Q.value = 0.8;
        const amp = ctx.createGain();
        amp.gain.value = 0.9;
        filter.connect(amp).connect(gain);
        loop("pink", filter);
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
        let timer = 0;
        const strike = () => {
          const key = `thunder-${Math.floor(Math.random() * 3)}`;
          void this.buffer(key)
            .then((buf) => {
              if (channel.stopped) return;
              const src = ctx.createBufferSource();
              src.buffer = buf;
              src.playbackRate.value = 0.8 + Math.random() * 0.4;
              const pan = ctx.createStereoPanner();
              pan.pan.value = Math.random() * 1.2 - 0.6;
              src.connect(pan).connect(gain);
              src.start();
              src.onended = () => pan.disconnect();
            })
            .catch(() => {});
          timer = window.setTimeout(strike, 14_000 + Math.random() * 30_000);
        };
        // Render the rumbles now, so the first strike is ready when it comes.
        [0, 1, 2].forEach((i) => void this.buffer(`thunder-${i}`).catch(() => {}));
        timer = window.setTimeout(strike, 2500 + Math.random() * 4000);
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
      default:
        loop(id);
    }

    this.channels.set(id, channel);
    return channel;
  }

  // ---------------------------------------------------------------- Chimes

  /** A short cue when a phase ends. `rising` for "back to work", falling for "break time". */
  async chime(kind: ChimeId, volume: number, rising = false) {
    if (kind === "none" || volume <= 0) return;
    const ctx = this.ensure();
    // Ring out in full: a break that fades the soundscape must not cut the chime short.
    this.chimeUntil = Math.max(this.chimeUntil, performance.now() + 3600);
    window.clearTimeout(this.suspendTimer);
    try {
      await ctx.resume();
    } catch {
      return;
    }
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
        ].forEach(([ratio, amp, decay]) => tone(f * ratio, at, decay, "sine", amp * 0.42));
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
      this.maybeSuspend();
    }, 3600);
  }
}

export const soundEngine = new SoundEngine();
