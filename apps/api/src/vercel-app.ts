import { handle } from 'hono/vercel';
import { createApp } from './app';

/**
 * The Vercel serverless entry — bundled to dist/vercel.mjs by build-vercel.mjs.
 *
 * Vercel's Node runtime only treats the default export as a Web (fetch-style)
 * handler when it's an object exposing `fetch(request)`. A bare function export
 * is invoked with the Node `(req, res) => void` signature instead, and the
 * Response we return is discarded — the request then hangs until it times out.
 * So we export the object shape here (and keep the raw fn as a named export).
 */
export const fetchHandler = handle(createApp());

export default { fetch: fetchHandler };
