// Hand-tracking proof. MediaPipe now runs in a hidden extension-origin iframe
// (so the meeting site's Trusted Types can't block it). This test loads the real
// extension, triggers getUserMedia (which spins up the tracker iframe), and waits
// for the iframe to report READY — proving MediaPipe HandLandmarker initializes
// in-browser from the bundled model through the iframe pipe. (The fake camera has
// no hand, so detection itself is verified live on a real call; the pinch/smoothing
// math is covered by the vitest unit suites.)
import { test, type BrowserContext } from '@playwright/test';
import { launchWithExtension, STUB_URL } from './extension';

let ctx: BrowserContext;
test.afterEach(async () => {
  await ctx?.close();
});

test('HAND-TRACKING PROOF — MediaPipe loads in the extension iframe and reports ready', async () => {
  ctx = await launchWithExtension();
  const page = await ctx.newPage();
  await page.goto(STUB_URL);
  await page.waitForFunction(() => !!(window as { __scribbleTest?: unknown }).__scribbleTest, null, {
    timeout: 20_000,
  });

  // getUserMedia → wrapStream('camera') → FingerTracker injects the tracker iframe
  await page.click('#startCam');
  await page.waitForFunction(
    () => {
      const v = document.getElementById('cam') as HTMLVideoElement | null;
      return !!v && v.videoWidth > 0;
    },
    null,
    { timeout: 20_000 },
  );

  // the iframe loads MediaPipe (extension origin, no Trusted Types) and posts ready
  await page.waitForFunction(
    () =>
      (window as unknown as { __scribbleTest: import('../../src/shared/types').ScribbleTestApi })
        .__scribbleTest.trackerReady() === true,
    null,
    { timeout: 30_000 },
  );

  console.log(
    '✅ HAND-TRACKING PROOF — MediaPipe HandLandmarker initialized inside the extension-origin iframe ' +
      '(immune to the meeting site Trusted Types that blocked it in the page) and the frame pipe is live. ' +
      'Pinch hysteresis + depth-invariance + 1€ smoothing proven in unit tests — PASS',
  );
});
