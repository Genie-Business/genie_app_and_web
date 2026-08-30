// Thin shim: @vercel/node transpiles this file in place, then the explicit
// `.mjs` import resolves the pre-bundled Hono app (scripts/build-vercel.mjs,
// run by vercel.json's buildCommand). Node runtime is Vercel's default for api/.
export { handler as default } from '../dist/vercel.mjs';
