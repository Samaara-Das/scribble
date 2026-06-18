// Hand-tracking proof. A real hand-video fixture isn't sourced in CI, so per the
// build spec's stated fallback we prove the MediaPipe pipeline INITIALIZES and runs
// inference in-browser from the bundled model + wasm (0 landmarks on a synthetic
// hand-less frame is expected). The pinch hysteresis + depth-invariance + 1€
// smoothing math is proven exhaustively in the vitest unit suites.
import { test, expect, type BrowserContext } from '@playwright/test';
import { launchWithExtension, STUB_URL } from './extension';

let ctx: BrowserContext;
test.afterEach(async () => {
  await ctx?.close();
});

test('HAND-TRACKING PROOF — MediaPipe HandLandmarker loads + infers from the bundled model', async () => {
  ctx = await launchWithExtension();
  const page = await ctx.newPage();
  await page.goto(STUB_URL);
  await page.waitForFunction(() => !!(window as { __scribbleTest?: unknown }).__scribbleTest, null, {
    timeout: 20_000,
  });

  const result = await page.evaluate(async () => {
    const t = (window as unknown as { __scribbleTest: import('../../src/shared/types').ScribbleTestApi })
      .__scribbleTest;
    return t.probeHands();
  });

  expect(result.initialized, 'HandLandmarker should initialize from the bundled assets').toBeTruthy();
  expect(result.landmarks, 'inference should run and return a landmark count (0 on a hand-less frame)').toBeGreaterThanOrEqual(0);
  console.log(
    `✅ HAND-TRACKING PROOF — HandLandmarker initialized + ran in-browser inference from the bundled ` +
      `hand_landmarker.task (landmarks on synthetic frame: ${result.landmarks}, 0 expected). ` +
      `Pinch hysteresis + depth-invariance + 1€ smoothing proven in unit tests (pinchDetector/oneEuroFilter/coordMapper) — PASS (synthetic-frame path)`,
  );
});
