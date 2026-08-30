// Thin shim: @vercel/node transpiles this file in place, then the explicit
// `.mjs` import resolves the pre-bundled Hono app (scripts/build-vercel.mjs,
// run by vercel.json's buildCommand).
//
// The default export MUST be an object with a `fetch` method — that's how
// Vercel's Node runtime knows to pass a Web `Request` and use the returned
// `Response`. A bare function is called as `(req, res) => void` and its return
// value is ignored, which hangs every request until the function times out.
import { fetchHandler } from '../dist/vercel.mjs';

export default { fetch: fetchHandler };
