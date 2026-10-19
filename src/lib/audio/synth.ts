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
  // White noise through a jittering resonant band-pass: bubbling water.
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  let target = 1200;
  let freq = 1200;
  let amp = 0.5;
  let ampTarget = 0.5;
  for (let i = 0; i < out.length; i++) {
    if (i % 64 === 0) {
      if (Math.random() < 0.03) target = 500 + Math.random() * 2200;
      if (Math.random() < 0.02) ampTarget = 0.25 + Math.random() * 0.75;
      freq += (target - freq) * 0.08;
      amp += (ampTarget - amp) * 0.02;
      const w0 = (2 * Math.PI * freq) / sr;
      const alpha = Math.sin(w0) / (2 * 2.2);
      b0 = alpha;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * Math.cos(w0);
      a2 = 1 - alpha;
    }
    const x = white();
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y * amp * 1.4;
  }
  const bed = new Float32Array(out.length);
  fillPink(bed);
  onePoleLowpass(bed, 1500, sr);
  for (let i = 0; i < out.length; i++) out[i] += bed[i] * 0.25;
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
