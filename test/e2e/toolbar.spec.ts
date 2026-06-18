// Drive the real UI like a user: click the Draw toggle in the Shadow-DOM toolbar,
// mouse-draw a stroke on the overlay, and capture before/after screenshots. Proves
// the toolbar (M3) + mouse drawing path (M1/M9) end to end. Equivalent to a /gstack
// drive, but against the real unpacked extension on the meeting stub.
import { test, expect, type BrowserContext } from '@playwright/test';
import { launchWithExtension, STUB_URL } from './extension';
import { mkdirSync } from 'node:fs';

const SHOTS = 'test-results/shots';

let ctx: BrowserContext;
test.afterEach(async () => {
  await ctx?.close();
});

test('TOOLBAR DRIVE — activate draw, mouse-draw a stroke, before/after screenshots', async () => {
  mkdirSync(SHOTS, { recursive: true });
  ctx = await launchWithExtension();
  const page = await ctx.newPage();
  await page.goto(STUB_URL);
  await page.waitForFunction(() => !!(window as { __scribbleTest?: unknown }).__scribbleTest, null, {
    timeout: 20_000,
  });
  await page.click('#startCam');
  await page.waitForFunction(
    () => {
      const v = document.getElementById('cam') as HTMLVideoElement | null;
      return !!v && v.videoWidth > 0;
    },
    null,
    { timeout: 20_000 },
  );

  const before = `${SHOTS}/toolbar-before.png`;
  const after = `${SHOTS}/toolbar-after.png`;
  await page.screenshot({ path: before });

  // toolbar is present in the shadow root
  const toolbarReady = await page.evaluate(() => {
    const host = document.getElementById('scribble-toolbar-host');
    return !!host?.shadowRoot?.querySelector('.bar');
  });
  expect(toolbarReady, 'Shadow-DOM toolbar should be mounted').toBeTruthy();

  // activate Draw mode by clicking the toolbar's draw toggle (real handler)
  await page.evaluate(() => {
    const host = document.getElementById('scribble-toolbar-host')!;
    const buttons = Array.from(host.shadowRoot!.querySelectorAll('button')) as HTMLButtonElement[];
    const draw = buttons.find((b) => b.textContent?.includes('Draw'));
    draw?.click();
  });

  const before0 = await page.evaluate(() =>
    (window as unknown as { __scribbleTest: import('../../src/shared/types').ScribbleTestApi }).__scribbleTest.strokeCount(),
  );

  // mouse-draw a diagonal across the overlay
  const box = page.viewportSize()!;
  await page.mouse.move(box.width * 0.3, box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.width * 0.45, box.height * 0.55, { steps: 8 });
  await page.mouse.move(box.width * 0.6, box.height * 0.7, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after0 = await page.evaluate(() =>
    (window as unknown as { __scribbleTest: import('../../src/shared/types').ScribbleTestApi }).__scribbleTest.strokeCount(),
  );
  await page.screenshot({ path: after });

  expect(after0, `a committed stroke should result from the mouse drag (before=${before0}, after=${after0})`).toBeGreaterThan(
    before0,
  );
  console.log(
    `✅ TOOLBAR DRIVE — Shadow-DOM toolbar mounted, Draw toggled, mouse stroke committed (${before0} -> ${after0}). ` +
      `Screenshots: ${before} , ${after}`,
  );
});
