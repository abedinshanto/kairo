// Offline synthesis of seamless ambience loops. Everything is generated on the
// device at play time — no audio files are shipped or streamed.

type Fill = (out: Float32Array, channel: number, sampleRate: number) => void;

const SEAM_SECONDS = 0.6;

/** Render `seconds` of audio per channel and blend the tail into the head so it loops without a click. */
export function renderLoop(ctx: BaseAudioContext, seconds: number, fill: Fill, channels = 2): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(seconds * sr);
  const seam = Math.floor(SEAM_SECONDS * sr);
  const buffer = ctx.createBuffer(channels, n, sr);
  for (let ch = 0; ch < channels; ch++) {
    const raw = new Float32Array(n + seam);
    fill(raw, ch, sr);
    const out = buffer.getChannelData(ch);
    for (let i = 0; i < n; i++) out[i] = raw[i];
    for (let i = 0; i < seam; i++) {
      const k = i / seam;
      out[i] = raw[i] * k + raw[n + i] * (1 - k);
    }
  }
  return buffer;
}

const white = () => Math.random() * 2 - 1;

export function fillWhite(out: Float32Array) {
  for (let i = 0; i < out.length; i++) out[i] = white() * 0.5;
}

export function fillPink(out: Float32Array) {
  // Paul Kellet's refined pink filter.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < out.length; i++) {
    const w = white();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
}

export function fillBrown(out: Float32Array) {
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    last = (last + 0.02 * white()) / 1.02;
    out[i] = last * 3.5;
  }
}

function onePoleLowpass(data: Float32Array, cutoff: number, sr: number) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += a * (data[i] - y);
    data[i] = y;
  }
}

function onePoleHighpass(data: Float32Array, cutoff: number, sr: number) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += a * (data[i] - y);
    data[i] = data[i] - y;
  }
}

/** Add a short event at `at`, wrapping past the end so loops stay seamless. */
function addEvent(out: Float32Array, at: number, length: number, sample: (i: number) => number) {
  const n = out.length;
  for (let i = 0; i < length; i++) out[(at + i) % n] += sample(i);
}

export const fillRain: Fill = (out, _ch, sr) => {
  fillPink(out);
  onePoleHighpass(out, 350, sr);
  onePoleLowpass(out, 6500, sr);
  for (let i = 0; i < out.length; i++) out[i] *= 0.9;
  const drops = Math.floor((out.length / sr) * 110);
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(Math.random() * out.length);
    const amp = 0.04 + Math.pow(Math.random(), 3) * 0.32;
    const len = Math.floor(sr * (0.002 + Math.random() * 0.01));
    const tau = len / 4;
    if (Math.random() < 0.12) {
      // A few tonal "plinks" on leaves and gutters.
      const f = 1800 + Math.random() * 3200;
      const plen = Math.floor(sr * 0.025);
      addEvent(out, at, plen, (i) => Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (plen / 5)) * amp * 0.5);
    } else {
      addEvent(out, at, len, (i) => white() * Math.exp(-i / tau) * amp);
    }
  }
};

export const fillOcean: Fill = (out, ch, sr) => {
  const n = out.length;
  const rumble = new Float32Array(n);
  fillBrown(rumble);
  onePoleLowpass(rumble, 500, sr);
  const surf = new Float32Array(n);
  fillPink(surf);
  onePoleHighpass(surf, 600, sr);
  const p1 = Math.random() * Math.PI * 2 + ch * 0.4;
  const p2 = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Whole numbers of cycles across the buffer keep the swell periodic.
    const swell = 0.55 + 0.3 * Math.sin(2 * Math.PI * 3 * t + p1) + 0.15 * Math.sin(2 * Math.PI * 5 * t + p2);
    const s = Math.max(0, swell);
    out[i] = rumble[i] * (0.35 + 0.65 * s) * 0.9 + surf[i] * Math.pow(s, 3) * 0.75;
  }
};

export const fillFire: Fill = (out, _ch, sr) => {
  fillBrown(out);
  onePoleLowpass(out, 260, sr);
  for (let i = 0; i < out.length; i++) out[i] *= 0.8;
  const crackles = Math.floor((out.length / sr) * 28);
  for (let c = 0; c < crackles; c++) {
    const at = Math.floor(Math.random() * out.length);
    const big = Math.random() < 0.15;
    const amp = big ? 0.35 + Math.random() * 0.45 : 0.04 + Math.random() * 0.18;
    const len = Math.floor(sr * (big ? 0.006 : 0.0025));
    const tau = len / 3;
    addEvent(out, at, len, (i) => white() * Math.exp(-i / tau) * amp);
    if (big && Math.random() < 0.5) {
      // Crackles come in little bursts.
      for (let k = 1; k < 4; k++) {
        const off = at + Math.floor(sr * (0.01 + Math.random() * 0.05) * k);
        addEvent(out, off, len, (i) => white() * Math.exp(-i / tau) * amp * 0.4);
      }
    }
  }
};

export const fillStream: Fill = (out, _ch, sr) => {
  // A brook is a steady rush of water with countless small bubbles popping in it.
  // The rush: pink noise with its rumble and hiss rolled off, its level only
  // flickering quickly (slow swells sound like breath on a microphone).
  fillPink(out);
  onePoleLowpass(out, 2400, sr);
  onePoleHighpass(out, 160, sr);
  let level = 1;
  let target = 1;
  const step = Math.floor(sr * 0.04);
  for (let i = 0; i < out.length; i++) {
    if (i % step === 0) target = 0.88 + Math.random() * 0.24;
    level += (target - level) * 0.004;
    out[i] *= 0.95 * level;
  }

  // The babble: each bubble rings like a little bell whose pitch rises as it
  // reaches the surface (Minnaert resonance; damping after van den Doel, 2005).
  // They come singly and in short bursts, mostly quiet, some brighter.
  const bubble = (at: number, f0: number, amp: number) => {
    const damping = (0.13 * f0 + 0.0072 * f0 ** 1.5) * 0.55;
    const rise = (0.25 + Math.random() * 0.45) * damping;
    const len = Math.min(Math.floor((sr * 5) / damping), Math.floor(sr * 0.15));
    const attack = sr * 0.0006;
    let phase = 0;
    addEvent(out, at, len, (i) => {
      const t = i / sr;
      phase += (2 * Math.PI * f0 * (1 + rise * t)) / sr;
      return Math.sin(phase) * Math.exp(-damping * t) * (1 - Math.exp(-i / attack)) * amp;
    });
  };
  const seconds = out.length / sr;
  const bursts = Math.floor(seconds * 20);
  for (let b = 0; b < bursts; b++) {
    const at = Math.floor(Math.random() * out.length);
    const n = Math.random() < 0.6 ? 1 : 2 + Math.floor(Math.random() * 5);
    for (let k = 0; k < n; k++) {
      // Log-uniform 380–2600 Hz: small bubbles are high and quieter.
      const f0 = 380 * 10 ** (Math.random() * 0.84);
      const amp = (0.065 + 0.28 * Math.random() ** 3) * Math.sqrt(700 / f0);
      bubble(at + Math.floor(sr * Math.random() * 0.09), f0, amp);
    }
  }
};

export const fillForest: Fill = (out, ch, sr) => {
  fillPink(out);
  onePoleLowpass(out, 1100, sr);
  for (let i = 0; i < out.length; i++) out[i] *= 0.18;
  const seconds = out.length / sr;
  const calls = Math.floor(seconds * 0.55);
  for (let c = 0; c < calls; c++) {
    // Birds are panned: each call favours one ear.
    const side = Math.random() < 0.5 ? 0 : 1;
    const gain = side === ch ? 1 : 0.35;
    let at = Math.floor(Math.random() * out.length);
    const chirps = 2 + Math.floor(Math.random() * 5);
    const base = 2400 + Math.random() * 3000;
    const sweep = (Math.random() < 0.5 ? -1 : 1) * (400 + Math.random() * 1400);
    const amp = (0.03 + Math.random() * 0.09) * gain;
    for (let k = 0; k < chirps; k++) {
      const len = Math.floor(sr * (0.04 + Math.random() * 0.11));
      const vib = 25 + Math.random() * 40;
      let phase = 0;
      addEvent(out, at, len, (i) => {
        const t = i / len;
        const f = base + sweep * t + Math.sin(2 * Math.PI * vib * (i / sr)) * 120;
        phase += (2 * Math.PI * f) / sr;
        return Math.sin(phase) * Math.sin(Math.PI * t) * amp;
      });
      at += len + Math.floor(sr * (0.03 + Math.random() * 0.12));
    }
  }
};

export const fillNight: Fill = (out, ch, sr) => {
  fillPink(out);
  onePoleLowpass(out, 700, sr);
  for (let i = 0; i < out.length; i++) out[i] *= 0.12;
  const crickets = [
    { f: 4300, every: 0.62, pan: 0 },
    { f: 4650, every: 0.83, pan: 1 },
    { f: 4480, every: 0.71, pan: ch },
  ];
  for (const c of crickets) {
    const gain = c.pan === ch ? 1 : 0.4;
    let t = Math.random() * c.every;
    const seconds = out.length / sr;
    while (t < seconds) {
      const pulses = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < pulses; p++) {
        const at = Math.floor((t + p * 0.032) * sr);
        const len = Math.floor(sr * 0.014);
        addEvent(out, at, len, (i) => Math.sin((2 * Math.PI * c.f * i) / sr) * Math.sin((Math.PI * i) / len) * 0.05 * gain);
      }
      t += c.every * (0.9 + Math.random() * 0.2);
    }
  }
};

/** One rumble of thunder (not looped): a slow-attack, long-tail brown-noise swell. */
export function renderThunder(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const seconds = 6 + Math.random() * 3;
  const n = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const attack = 0.08 + Math.random() * 0.6;
  const peaks = [0, 0.4 + Math.random() * 0.8, 1.3 + Math.random() * 1.2];
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    fillBrown(data);
    onePoleLowpass(data, 380, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let env = 0;
      for (const p of peaks) {
        if (t < p) continue;
        const local = t - p;
        env += (local < attack ? local / attack : Math.exp(-(local - attack) / 1.6)) * (p === 0 ? 1 : 0.6);
      }
      data[i] *= Math.min(1.4, env) * 1.6;
    }
  }
  return buf;
}

/** A two-pole band-pass (RBJ cookbook, 0 dB at the peak) whose centre can move. */
class Resonator {
  private b0 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private sr: number;
  constructor(sr: number) {
    this.sr = sr;
  }
  set(freq: number, q: number) {
    const w = (2 * Math.PI * freq) / this.sr;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }
  run(x: number) {
    const y = this.b0 * (x - this.x2) - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** A one-pole low-pass as a running function, for shaping single events. */
const smoother = (cutoff: number, sr: number) => {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  let y = 0;
  return (x: number) => (y += a * (x - y));
};

export const fillCafe: Fill = (out, ch, sr) => {
  const n = out.length;
  const seconds = n / sr;
  // The room: a low, warm bed under everything.
  fillBrown(out);
  onePoleLowpass(out, 320, sr);
  for (let i = 0; i < n; i++) out[i] *= 0.3;

  // Chatter: voices around the room, too many and too far away to follow.
  // Each is a soft buzz (the voice) through two moving resonances (the vowels),
  // in syllables and phrases with pauses between. Distance takes everything
  // above ~2 kHz away, so they're made at a quarter of the rate and scaled up.
  const step = 4;
  const vr = sr / step;
  const m = Math.ceil(n / step) + 1;
  const low = new Float32Array(m);
  const voices = 10;
  for (let v = 0; v < voices; v++) {
    const near = Math.random() < 0.5 ? ch === 0 : ch === 1;
    const gain = (0.3 + Math.random() * 0.7) * (near ? 1 : 0.55);
    const pitch = Math.random() < 0.5 ? 100 + Math.random() * 35 : 180 + Math.random() * 50;
    const f1 = new Resonator(vr);
    const f2 = new Resonator(vr);
    const tilt = smoother(500, vr);
    let i = Math.floor(Math.random() * vr * 3);
    let phase = 0;
    let drift = 0;
    while (i < m) {
      const syllables = 3 + Math.floor(Math.random() * 10);
      for (let s = 0; s < syllables && i < m; s++) {
        const len = Math.floor(vr * (0.1 + Math.random() * 0.17));
        f1.set(300 + Math.random() * 500, 5);
        f2.set(900 + Math.random() * 1500, 7);
        const amp = 0.45 + Math.random() * 0.55;
        // Phrases fall in pitch towards their end.
        const f0 = pitch * (1.12 - (0.2 * s) / syllables);
        for (let k = 0; k < len && i < m; k++, i++) {
          drift += (Math.random() - 0.5) * 0.004;
          drift *= 0.996;
          phase += (f0 * (1 + drift)) / vr;
          if (phase >= 1) phase -= 1;
          const buzz = tilt(phase * 2 - 1) + white() * 0.04;
          const env = Math.sqrt(Math.sin((Math.PI * k) / len));
          low[i] += (f1.run(buzz) + 0.55 * f2.run(buzz)) * env * amp * gain;
        }
      }
      i += Math.floor(vr * (0.25 + Math.random() * 1.8));
    }
  }
  const talk = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / step;
    const j = Math.floor(x);
    talk[i] = low[j] + (low[j + 1] - low[j]) * (x - j);
  }
  onePoleLowpass(talk, 2200, sr);
  onePoleHighpass(talk, 170, sr);
  for (let i = 0; i < n; i++) out[i] += talk[i] * 1.6;

  // Cups and spoons: a small bright clink now and then.
  const clinks = Math.max(2, Math.floor(seconds * 0.3));
  for (let c = 0; c < clinks; c++) {
    const at = Math.floor(Math.random() * n);
    const base = 2100 + Math.random() * 2400;
    const near = Math.random() < 0.5 ? ch === 0 : ch === 1;
    const amp = (0.02 + Math.random() ** 2 * 0.07) * (near ? 1 : 0.5);
    const len = Math.floor(sr * 0.35);
    const hits = Math.random() < 0.4 ? 2 : 1;
    for (let h = 0; h < hits; h++) {
      const start = at + h * Math.floor(sr * (0.08 + Math.random() * 0.1));
      addEvent(out, start, len, (i) => {
        const t = i / sr;
        return (
          (Math.sin(2 * Math.PI * base * t) * Math.exp(-t * 14) +
            0.6 * Math.sin(2 * Math.PI * base * 2.71 * t) * Math.exp(-t * 24) +
            0.3 * Math.sin(2 * Math.PI * base * 5.12 * t) * Math.exp(-t * 40)) *
          amp *
          (h ? 0.6 : 1)
        );
      });
    }
  }
};

export const fillTrain: Fill = (out, ch, sr) => {
  const n = out.length;
  // The carriage: a deep rumble that sways a little, and air rushing past.
  fillBrown(out);
  onePoleLowpass(out, 150, sr);
  const air = new Float32Array(n);
  fillPink(air);
  onePoleHighpass(air, 900, sr);
  onePoleLowpass(air, 4500, sr);
  const p1 = Math.random() * Math.PI * 2;
  const p2 = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Whole cycles across the loop keep it seamless.
    const sway = 1 + 0.1 * Math.sin(2 * Math.PI * 3 * t + p1) + 0.05 * Math.sin(2 * Math.PI * 11 * t + p2);
    const hum = 0.05 * Math.sin((2 * Math.PI * 96 * i) / sr) + 0.02 * Math.sin((2 * Math.PI * 192 * i) / sr + ch);
    out[i] = out[i] * 1.1 * sway + air[i] * 0.09 + hum * sway;
  }

  // Rail joints, once a second: "ta-tak" from the wheels below, fainter from
  // the far end of the carriage. The loop holds a whole number of them.
  const clack = (at: number, amp: number) => {
    const len = Math.floor(sr * 0.12);
    const low = smoother(420, sr);
    const ring = 300 + Math.random() * 40;
    addEvent(out, at, len, (i) => {
      const t = i / sr;
      const thump = low(white()) * 3.2 * Math.exp(-t * 38);
      const metal = (Math.sin(2 * Math.PI * ring * t) + 0.5 * Math.sin(2 * Math.PI * ring * 3.3 * t)) * 0.12 * Math.exp(-t * 55);
      return (thump + metal) * amp;
    });
  };
  const period = 1;
  const offset = Math.random() * 0.5;
  for (let t = offset; t * sr < n; t += period) {
    const a = 0.85 + Math.random() * 0.3;
    const near = ch === 0 ? 1 : 0.8;
    clack(Math.floor(t * sr), 0.55 * a * near);
    clack(Math.floor((t + 0.11) * sr), 0.47 * a * near);
    clack(Math.floor((t + 0.64) * sr), 0.2 * a * (1.8 - near));
    clack(Math.floor((t + 0.75) * sr), 0.17 * a * (1.8 - near));
  }
};

export const fillLibrary: Fill = (out, ch, sr) => {
  const n = out.length;
  const seconds = n / sr;
  // Air handling: a soft, even hush.
  fillPink(out);
  onePoleLowpass(out, 520, sr);
  onePoleHighpass(out, 70, sr);
  for (let i = 0; i < n; i++) out[i] *= 0.45;

  const side = () => (Math.random() < 0.5 ? ch === 0 : ch === 1) ? 1 : 0.45;

  // Pages turning: a quick papery swish, lifted then laid down.
  const turns = Math.max(3, Math.floor(seconds * 0.14));
  for (let p = 0; p < turns; p++) {
    const at = Math.floor(Math.random() * n);
    const len = Math.floor(sr * (0.35 + Math.random() * 0.3));
    const hp = smoother(1600, sr);
    const lp = smoother(6500, sr);
    const amp = (0.08 + Math.random() * 0.08) * side();
    addEvent(out, at, len, (i) => {
      const t = i / len;
      const x = white();
      const band = lp(x - hp(x));
      const env = Math.sin(Math.PI * t) ** 2 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 2.5 * t));
      return band * env * amp;
    });
  }

  // Someone walking past: soft steps, coming closer, then fading.
  const walks = Math.max(1, Math.floor(seconds / 25));
  for (let w = 0; w < walks; w++) {
    const steps = 7 + Math.floor(Math.random() * 6);
    let at = Math.floor(Math.random() * n);
    const leftToRight = Math.random() < 0.5;
    for (let s = 0; s < steps; s++) {
      const pos = s / (steps - 1);
      const near = Math.sin(Math.PI * pos);
      const pan = leftToRight ? pos : 1 - pos;
      const amp = 0.22 * near * (ch === 0 ? 1 - pan * 0.6 : 0.4 + pan * 0.6);
      const low = smoother(260, sr);
      const len = Math.floor(sr * 0.09);
      addEvent(out, at, len, (i) => low(white()) * 3 * Math.exp(-i / (sr * 0.018)) * amp);
      at += Math.floor(sr * (0.52 + Math.random() * 0.06));
    }
  }

  // A pencil writing: scratchy strokes, a few seconds at a time.
  const notes = Math.max(1, Math.floor(seconds / 15));
  for (let k = 0; k < notes; k++) {
    const at = Math.floor(Math.random() * n);
    const len = Math.floor(sr * (1.2 + Math.random() * 1.8));
    const hp = smoother(2600, sr);
    const rate = 6 + Math.random() * 4;
    const amp = 0.035 * side();
    addEvent(out, at, len, (i) => {
      const t = i / sr;
      const x = white();
      const scratch = x - hp(x);
      const stroke = Math.max(0, Math.sin(2 * Math.PI * rate * t + Math.sin(t * 7) * 2)) ** 3;
      const edge = Math.min(1, t * 8, (len / sr - t) * 8);
      return scratch * stroke * edge * amp;
    });
  }

  // Now and then, a book set down on a table.
  const books = Math.max(1, Math.floor(seconds / 20));
  for (let b = 0; b < books; b++) {
    const at = Math.floor(Math.random() * n);
    const low = smoother(200, sr);
    const amp = 0.25 * side();
    addEvent(out, at, Math.floor(sr * 0.25), (i) => low(white()) * 3 * Math.exp(-i / (sr * 0.04)) * amp);
  }
};
