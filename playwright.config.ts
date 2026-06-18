import { defineConfig } from '@playwright/test';

// Extension e2e: each spec launches its own persistent context with the unpacked
// build loaded (Playwright's default page fixture can't load extensions), so there
// is no shared `use` browser here. The webServer serves the meeting stub.
export default defineConfig({
  testDir: 'test/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: 'node test/harness/serve.mjs',
    url: 'http://localhost:5174/meeting-stub.html',
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
