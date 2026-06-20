// THE crux proof. Without any live call, prove that Scribble bakes annotations into
// the OUTBOUND streams other participants receive:
//   - camera: real getUserMedia (fake device) is intercepted by the patch, a red
//     stroke is drawn via the test hook, and the composited stream shows red.
//   - screen: the production compositor (the exact getDisplayMedia code path) is run
//     on a synthetic blue source; the output shows the red annotation while the blue
//     source content is preserved. (Real getDisplayMedia is the human live-call check.)
import { test, expect, type BrowserContext } from '@playwright/test';
import { launchWithExtension, STUB_URL, isRed, type Rgb } from './extension';

let ctx: BrowserContext;
test.afterEach(async () => {
  await ctx?.close();
});

test('CAMERA COMPOSITE PROOF — annotation appears in the outbound getUserMedia stream', async () => {
  ctx = await launchWithExtension();
  const page = await ctx.newPage();
  await page.goto(STUB_URL);

  // extension injected + test hook present
  await page.waitForFunction(() => !!(window as { __scribbleTest?: unknown }).__scribbleTest, null, {
    timeout: 20_000,
  });

  // page calls getUserMedia -> patched -> composited stream rendered in #cam
  await page.click('#startCam');
  await page.waitForFunction(
    () => {
      const v = document.getElementById('cam') as HTMLVideoElement | null;
      return !!v && v.videoWidth > 0 && v.readyState >= 2;
    },
    null,
    { timeout: 20_000 },
  );

  // draw a thick red diagonal via the test hook (normalized coords)
  await page.evaluate(() => {
    const t = (window as unknown as { __scribbleTest: import('../../src/shared/types').ScribbleTestApi })
      .__scribbleTest;
    t.setTool('pen');
    t.setColor('#ff0000');
    t.setWidth(16);
    t.drawStroke([
      { x: 0.2, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.8, y: 0.8 },
    ]);
  });

  // Poll until the composited stroke appears (robust to compositor start-up /
  // CPU contention) instead of a fixed wait.
  await page.waitForFunction(
    () => {
      const v = document.getElementById('cam') as HTMLVideoElement | null;
      if (!v || !v.videoWidth) return false;
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const g = c.getContext('2d')!;
      g.drawImage(v, 0, 0, c.width, c.height);
      let hits = 0;
      for (let i = 0; i <= 8; i++) {
        const f = 0.2 + 0.6 * (i / 8);
        const d = g.getImageData(Math.floor(f * c.width), Math.floor(f * c.height), 1, 1).data;
        if (d[0] > 140 && d[1] < 110 && d[2] < 110) hits++;
      }
      return hits >= 3;
    },
    null,
    { timeout: 25_000 },
  );

  const { diag, control } = await page.evaluate(() => {
    const v = document.getElementById('cam') as HTMLVideoElement;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const g = c.getContext('2d')!;
    g.drawImage(v, 0, 0, c.width, c.height);
    const at = (x: number, y: number) => {
      const d = g.getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    };
    const diag = [];
    for (let i = 0; i <= 8; i++) {
      const f = 0.2 + 0.6 * (i / 8);
      diag.push(at(f, f));
    }
    return { diag, control: at(0.9, 0.1) };
  });

  const redHits = (diag as Rgb[]).filter(isRed).length;
  expect(redHits, `expected red annotation along the diagonal, got ${redHits}/9`).toBeGreaterThanOrEqual(3);
  console.log(
    `✅ CAMERA COMPOSITE PROOF — red stroke present in outbound camera track (${redHits}/9 diagonal samples red); ` +
      `control pixel rgb(${control.r},${control.g},${control.b}) — PASS`,
  );
});

test('SCREEN-SHARE COMPOSITE PROOF — annotation composited onto the screen-share track', async () => {
  ctx = await launchWithExtension();
  const page = await ctx.newPage();
  await page.goto(STUB_URL);
  await page.waitForFunction(() => !!(window as { __scribbleApp?: unknown }).__scribbleApp, null, {
    timeout: 20_000,
  });

  const { diag, bg } = await page.evaluate(async () => {
    const t = (window as unknown as { __scribbleTest: import('../../src/shared/types').ScribbleTestApi })
      .__scribbleTest;
    t.setTool('pen');
    t.setColor('#ff0000');
    t.setWidth(16);
    t.drawStroke([
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0.75 },
    ]);

    // synthetic blue 'screen' source through the REAL production compositor path
    const src = document.createElement('canvas');
    src.width = 640;
    src.height = 480;
    const sg = src.getContext('2d')!;
    let painting = true;
    const paint = () => {
      if (!painting) return;
      sg.fillStyle = '#0000ff';
      sg.fillRect(0, 0, 640, 480);
      requestAnimationFrame(paint);
    };
    paint();
    const srcStream = (src as HTMLCanvasElement).captureStream(30);

    const app = (window as unknown as {
      __scribbleApp: { wrapStream(s: MediaStream, target: 'camera' | 'screen'): Promise<MediaStream> };
    }).__scribbleApp;
    const out = await app.wrapStream(srcStream, 'screen');

    const v = document.createElement('video');
    v.muted = true;
    v.srcObject = out;
    await v.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 700));

    const c = document.createElement('canvas');
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    const g = c.getContext('2d')!;
    g.drawImage(v, 0, 0, c.width, c.height);
    const at = (x: number, y: number) => {
      const d = g.getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    };
    const diag = [];
    for (let i = 0; i <= 8; i++) {
      const f = 0.25 + 0.5 * (i / 8);
      diag.push(at(f, f));
    }
    const bg = at(0.92, 0.08);
    painting = false;
    return { diag, bg };
  });

  const redHits = (diag as Rgb[]).filter(isRed).length;
  const blueBg = bg.b > 120 && bg.r < 110;
  expect(redHits, `expected red annotation on the screen track, got ${redHits}/9`).toBeGreaterThanOrEqual(3);
  expect(blueBg, `expected blue source preserved, got rgb(${bg.r},${bg.g},${bg.b})`).toBeTruthy();
  console.log(
    `✅ SCREEN-SHARE COMPOSITE PROOF — red annotation on screen-share track (${redHits}/9), ` +
      `blue source preserved rgb(${bg.r},${bg.g},${bg.b}) — PASS`,
  );
});

test('ERASER PROOF — eraser reveals the source video, not black', async () => {
  ctx = await launchWithExtension();
  const page = await ctx.newPage();
  await page.goto(STUB_URL);
  await page.waitForFunction(() => !!(window as { __scribbleApp?: unknown }).__scribbleApp, null, {
    timeout: 20_000,
  });

  const { drawn, erased, countBefore, countAfter } = await page.evaluate(async () => {
    const t = (window as unknown as { __scribbleTest: import('../../src/shared/types').ScribbleTestApi })
      .__scribbleTest;

    // solid blue source through the production compositor
    const src = document.createElement('canvas');
    src.width = 640;
    src.height = 480;
    const sg = src.getContext('2d')!;
    let painting = true;
    const paint = () => {
      if (!painting) return;
      sg.fillStyle = '#0000ff';
      sg.fillRect(0, 0, 640, 480);
      requestAnimationFrame(paint);
    };
    paint();
    const app = (window as unknown as {
      __scribbleApp: { wrapStream(s: MediaStream, target: 'camera' | 'screen'): Promise<MediaStream> };
    }).__scribbleApp;
    const out = await app.wrapStream((src as HTMLCanvasElement).captureStream(30), 'screen');
    const v = document.createElement('video');
    v.muted = true;
    v.srcObject = out;
    await v.play().catch(() => {});

    const sample = async (): Promise<{ r: number; g: number; b: number }> => {
      await new Promise((r) => setTimeout(r, 400));
      const c = document.createElement('canvas');
      c.width = v.videoWidth || 640;
      c.height = v.videoHeight || 480;
      const g = c.getContext('2d')!;
      g.drawImage(v, 0, 0, c.width, c.height);
      const d = g.getImageData(Math.floor(0.5 * c.width), Math.floor(0.5 * c.height), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    };

    t.setTool('pen');
    t.setColor('#ff0000');
    t.setWidth(22);
    t.drawStroke([{ x: 0.3, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 }]);
    const drawn = await sample();
    const countBefore = t.strokeCount();

    // object-eraser: removing the stroke must reveal the source (no destination-out)
    t.erase([{ x: 0.3, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 }]);
    const erased = await sample();
    const countAfter = t.strokeCount();

    painting = false;
    return { drawn, erased, countBefore, countAfter };
  });

  expect(isRed(drawn), `expected red ink before erasing, got rgb(${drawn.r},${drawn.g},${drawn.b})`).toBeTruthy();
  expect(countBefore, 'one stroke before erasing').toBe(1);
  expect(countAfter, 'stroke removed after erasing').toBe(0);
  const blueRestored = erased.b > 120 && erased.r < 110;
  expect(blueRestored, `eraser should reveal blue source, got rgb(${erased.r},${erased.g},${erased.b})`).toBeTruthy();
  console.log(
    `✅ ERASER PROOF — drew red (strokes ${countBefore}), erased → strokes ${countAfter}, ` +
      `source blue revealed rgb(${erased.r},${erased.g},${erased.b}) — PASS`,
  );
});
