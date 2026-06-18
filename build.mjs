// Scribble build — esbuild bundles each extension entry into dist/.
// Content scripts (sentinel, bridge) MUST be IIFE (Chrome injects classic scripts);
// the service worker is an ES module. Static files (manifest, mediapipe assets) are copied.
//
// Production builds (default) strip the localhost test entries from the manifest and,
// via NODE_ENV='production', dead-code-eliminate the window.__scribbleTest hook — so the
// shipped artifact can never inject the test API on a real site. Pass --dev (or --watch)
// to keep the localhost test surface for the Playwright e2e harness.
import { build, context } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');
const outdir = 'dist';
const LOCALHOST_MATCH = 'http://localhost:5174/*';

const entries = [
  { in: 'src/inject/sentinel.ts', out: 'sentinel', format: 'iife' },
  { in: 'src/content/bridge.ts', out: 'bridge', format: 'iife' },
  { in: 'src/background.ts', out: 'background', format: 'esm' },
];

function stripLocalhost(manifest) {
  for (const cs of manifest.content_scripts ?? []) {
    cs.matches = (cs.matches ?? []).filter((m) => m !== LOCALHOST_MATCH);
  }
  for (const war of manifest.web_accessible_resources ?? []) {
    war.matches = (war.matches ?? []).filter((m) => m !== LOCALHOST_MATCH);
  }
  return manifest;
}

async function copyStatic() {
  await mkdir(outdir, { recursive: true });
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  if (!dev) stripLocalhost(manifest);
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2));
  if (existsSync('public')) await cp('public', outdir, { recursive: true });
}

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await copyStatic();
  for (const e of entries) {
    /** @type {import('esbuild').BuildOptions} */
    const opts = {
      entryPoints: [e.in],
      bundle: true,
      format: e.format,
      outfile: `${outdir}/${e.out}.js`,
      target: 'chrome120',
      sourcemap: true,
      legalComments: 'none',
      define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
      logLevel: 'info',
    };
    if (watch) {
      const ctx = await context(opts);
      await ctx.watch();
    } else {
      await build(opts);
    }
  }
  console.log(watch ? 'Watching…' : `Build complete -> ${outdir}/ (${dev ? 'dev' : 'production'})`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
