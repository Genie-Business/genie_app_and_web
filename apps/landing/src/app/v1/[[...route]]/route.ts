/**
 * The genie REST API, served from this app under /v1/*.
 *
 * It's the same Hono app that used to be its own Vercel project (apps/api): that package's
 * `build` bundles it to dist/vercel.mjs, and turbo builds it first because this app depends
 * on @genie/api. Requests for /v1/** land here untouched, so the paths the mobile app and the
 * OpenAPI document use are unchanged.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Handler = (req: Request) => Response | Promise<Response>;

let loaded: Promise<Handler> | undefined;

// Loaded on the first request rather than at import time: createApp() validates the environment
// (database URL, JWT secrets), and `next build` imports route modules without the runtime env.
function load(): Promise<Handler> {
  loaded ??= import('@genie/api/vercel')
    .then((m) => m.fetchHandler as Handler)
    .catch((err) => {
      loaded = undefined; // don't cache a failure — a fixed env var should work on the next request
      throw err;
    });
  return loaded;
}

async function handle(req: Request): Promise<Response> {
  return (await load())(req);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS, handle as HEAD };
