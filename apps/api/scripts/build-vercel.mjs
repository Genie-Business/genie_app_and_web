// Bundle the Hono app into one self-contained ESM file for the Vercel function.
//
// Why: @vercel/node transpiles api/index.ts file-by-file and does not rewrite
// our extension-less / raw-.ts workspace imports (@genie/db, @genie/core, …),
// so the deployed function can't resolve `../src/app`. esbuild inlines all of
// that here. Only the Prisma + Neon driver packages stay external — they're
// pure JS (no query-engine binary, thanks to the driver adapter) and Vercel's
// tracer picks them up from the shim's import.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '..');

await build({
  entryPoints: [resolve(apiRoot, 'src/vercel-app.ts')],
  outfile: resolve(apiRoot, 'dist/vercel.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  legalComments: 'none',
  external: [
    '@prisma/client',
    '.prisma/client',
    '@prisma/adapter-neon',
    '@neondatabase/serverless',
    'ws',
    // pino uses dynamic requires + a worker thread for transports; keep it
    // unbundled so Vercel's tracer resolves it and its worker correctly.
    'pino',
    'pino-pretty',
    'thread-stream',
  ],
  logLevel: 'info',
});

console.log('bundled -> apps/api/dist/vercel.mjs');
