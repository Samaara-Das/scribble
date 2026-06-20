// BUILD+LOAD proof: the unpacked extension loads in Chrome, both content scripts
// (ISOLATED bridge + MAIN-world runtime) initialize, and the page reports no
// console errors or uncaught page errors during load.
import { test, expect, type BrowserContext } from '@playwright/test';
import { launchWithExtension, STUB_URL } from './extension';

let ctx: BrowserContext;
test.afterEach(async () => {
  await ctx?.close();
});

test('BUILD+LOAD — extension loads with no console errors', async () => {
  ctx = await launchWithExtension();
  const page = await ctx.newPage();

  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(STUB_URL);

  // MAIN-world runtime booted (test hook + app) AND the bridge published the base URL
  await page.waitForFunction(
    () =>
      !!(window as { __scribbleApp?: unknown }).__scribbleApp &&
      !!(window as { __scribbleTest?: unknown }).__scribbleTest &&
      document.documentElement.hasAttribute('data-scribble-base'),
    null,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(500);

  expect(errors, `console errors during load:\n${errors.join('\n')}`).toEqual([]);
  console.log('✅ BUILD+LOAD — extension loaded in Chrome, bridge + MAIN runtime initialized, 0 console errors');
});
