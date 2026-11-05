// Downloads the on-device dictation model (Whisper tiny.en, quantised, ~32 MB)
// into src-tauri/voice/, where the desktop app bundles it. Runs after `npm install`;
// skips work when the file is already there and verified. Set
// KAIRO_SKIP_VOICE_MODEL=1 to skip (mobile-only builds don't need it).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "ggml-tiny.en-q5_1.bin";
const URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${NAME}`;
const SHA256 = "c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b";
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "voice", NAME);

const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

if (process.env.KAIRO_SKIP_VOICE_MODEL) process.exit(0);
if (existsSync(dest) && sha(dest) === SHA256) process.exit(0);

mkdirSync(dirname(dest), { recursive: true });
const tmp = `${dest}.part`;
console.log(`Downloading the voice model (${NAME}, ~32 MB)…`);
try {
  // curl ships with macOS, Windows 10+ and Linux, and honours proxy settings.
  execFileSync("curl", ["-fsSL", "--retry", "4", "--retry-delay", "2", "-o", tmp, URL], { stdio: "inherit" });
} catch {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Voice model download failed: HTTP ${res.status}`);
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
}
const got = sha(tmp);
if (got !== SHA256) {
  rmSync(tmp, { force: true });
  throw new Error(`Voice model checksum mismatch (got ${got})`);
}
renameSync(tmp, dest);
console.log("Voice model ready.");
