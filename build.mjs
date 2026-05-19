import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(__dirname, 'dist');
const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [
    resolve(__dirname, 'src/background.ts'),
    resolve(__dirname, 'src/content.ts'),
  ],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  outdir,
  logLevel: 'info',
};

async function copyStatic() {
  await mkdir(outdir, { recursive: true });
  await Promise.all([
    cp(resolve(__dirname, 'manifest.json'), resolve(outdir, 'manifest.json')),
    cp(resolve(__dirname, 'overlay.css'), resolve(outdir, 'overlay.css')),
    cp(resolve(__dirname, 'icons'), resolve(outdir, 'icons'), { recursive: true }),
  ]);
}

await rm(outdir, { recursive: true, force: true });
await copyStatic();

if (watch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('[lab900] esbuild watching…');
} else {
  await build(buildOptions);
}
