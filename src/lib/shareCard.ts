// Render the focus persona as a shareable PNG. Only the persona summary is
// drawn — no app names, sites or timestamps leave the device inside it.

import { isNative } from "./backend";
import type { Persona } from "./insights";

const W = 1080;
const H = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderPersonaCard(persona: Persona, rangeDays: number, activeHours: number): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = (weight: number, size: number) => `${weight} ${size}px "Inter Variable", Inter, system-ui, sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#141a2c");
  bg.addColorStop(1, "#07080d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.78, H * 0.22, 0, W * 0.78, H * 0.22, W * 0.75);
  glow.addColorStop(0, "rgba(57,135,229,0.38)");
  glow.addColorStop(0.5, "rgba(144,133,233,0.12)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Big decorative ring
  const ring = ctx.createLinearGradient(W * 0.5, 0, W, H * 0.5);
  ring.addColorStop(0, "#7fb2ff");
  ring.addColorStop(0.55, "#3987e5");
  ring.addColorStop(1, "#9085e9");
  ctx.lineCap = "round";
  ctx.lineWidth = 36;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.arc(W * 0.8, H * 0.24, 230, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = ring;
  ctx.beginPath();
  ctx.arc(W * 0.8, H * 0.24, 230, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.83);
  ctx.stroke();

  const pad = 96;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = font(650, 40);
  ctx.fillText("Kairo", pad, 140);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = font(600, 28);
  ctx.fillText("MY FOCUS PERSONA", pad, 560);

  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 112);
  const nameLines = wrap(ctx, persona.name, W - pad * 2);
  nameLines.forEach((l, i) => ctx.fillText(l, pad, 690 + i * 120));
  let y = 690 + nameLines.length * 120 + 10;

  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.font = font(450, 38);
  for (const l of wrap(ctx, persona.tagline, W - pad * 2)) {
    ctx.fillText(l, pad, y);
    y += 54;
  }

  const cardY = H - 330;
  roundRect(ctx, pad - 8, cardY, W - pad * 2 + 16, 170, 32);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const colW = (W - pad * 2) / persona.traits.length;
  persona.traits.forEach((t, i) => {
    const x = pad + 32 + i * colW;
    ctx.fillStyle = "#ffffff";
    ctx.font = font(650, 52);
    ctx.fillText(t.value, x, cardY + 90);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = font(500, 26);
    ctx.fillText(t.label, x, cardY + 132);
  });

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = font(500, 26);
  ctx.fillText(`Last ${rangeDays} days · ${Math.round(activeHours)} active hours · tracked privately on-device`, pad, H - 84);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), "image/png"));
}

export async function exportPersonaCard(persona: Persona, rangeDays: number, activeHours: number): Promise<boolean> {
  const blob = await renderPersonaCard(persona, rangeDays, activeHours);
  const name = `kairo-persona-${new Date().toISOString().slice(0, 10)}.png`;
  if (isNative) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: name, filters: [{ name: "PNG image", extensions: ["png"] }] });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
