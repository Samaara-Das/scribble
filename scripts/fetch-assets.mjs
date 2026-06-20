// Fetches the MediaPipe hand-tracking assets into public/mediapipe/ so the
// extension runs fully offline (no CDN at runtime).
//  - wasm runtime: copied from the installed @mediapipe/tasks-vision package
//  - hand_landmarker.task model: downloaded from Google's model store
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = 'public/mediapipe';
const wasmSrc = 'node_modules/@mediapipe/tasks-vision/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function main() {
  await mkdir(`${root}/wasm`, { recursive: true });

  if (existsSync(wasmSrc)) {
    await cp(wasmSrc, `${root}/wasm`, { recursive: true });
    console.log(`Copied MediaPipe wasm runtime -> ${root}/wasm`);
  } else {
    console.error(`Missing ${wasmSrc} — run "npm install" first.`);
    process.exit(1);
  }

  const modelPath = `${root}/hand_landmarker.task`;
  if (existsSync(modelPath)) {
    console.log('hand_landmarker.task already present, skipping download.');
    return;
  }
  console.log('Downloading hand_landmarker.task …');
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    console.error(`Model download failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(modelPath, buf);
  console.log(`Saved hand_landmarker.task (${(buf.length / 1e6).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
