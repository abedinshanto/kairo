// Renders soundscape loops off the main thread, so pressing play never freezes
// the interface (a loop takes up to half a second of number crunching).

import { renderSound } from "./synth";

interface Request {
  id: number;
  key: string;
  sampleRate: number;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, key, sampleRate } = e.data;
  try {
    const channels = renderSound(key, sampleRate);
    (self as unknown as Worker).postMessage({ id, channels }, channels.map((c) => c.buffer));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
