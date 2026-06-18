// Launches a Chromium persistent context with the unpacked Scribble build loaded
// and fake media devices, so e2e tests run the real extension end-to-end.
import { chromium, type BrowserContext } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const STUB_URL = 'http://localhost:5174/meeting-stub.html';
const DIST = fileURLToPath(new URL('../../dist', import.meta.url));

export async function launchWithExtension(extraArgs: string[] = []): Promise<BrowserContext> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'scribble-e2e-'));
  return chromium.launchPersistentContext(userDataDir, {
    headless: false, // extensions require a headful context
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      ...extraArgs,
    ],
  });
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function isRed({ r, g, b }: Rgb): boolean {
  return r > 140 && g < 110 && b < 110;
}
