// Scribble build — esbuild bundles each extension entry into dist/.
// Content scripts (sentinel, bridge) MUST be IIFE (Chrome injects classic scripts);
// the service worker is an ES module. Static files (manifest, mediapipe assets) are copied.
import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

const entries = [
  { in: 'src/inject/sentinel.ts', out: 'sentinel', format: 'iife' },
  { in: 'src/content/bridge.ts', out: 'bridge', format: 'iife' },
  { in: 'src/background.ts', out: 'background', format: 'esm' },
];

async function copyStatic() {
  await mkdir(outdir, { recursive: true });
  await cp('manifest.json', `${outdir}/manifest.json`);
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
      define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
      logLevel: 'info',
    };
    if (watch) {
      const ctx = await context(opts);
      await ctx.watch();
    } else {
      await build(opts);
    }
  }
  console.log(watch ? 'Watching…' : `Build complete -> ${outdir}/`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
