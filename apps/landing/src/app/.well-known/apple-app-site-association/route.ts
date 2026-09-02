/**
 * iOS Universal Links association. Served with `Content-Type: application/json`
 * and no file extension (a route handler, not a static file).
 *
 * TODO: replace TEAMID with the real Apple Developer Team ID once the app has an
 * Apple account + provisioning profile. Until then iOS universal links won't
 * verify (the app opens via the `genie://` scheme fallback instead).
 */
const TEAM_ID = process.env.APPLE_TEAM_ID ?? 'TEAMID';
const BUNDLE_ID = 'co.genieapps.genie';

export function GET() {
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${TEAM_ID}.${BUNDLE_ID}`,
          paths: ['/w/*', '/join'],
        },
      ],
    },
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
}
