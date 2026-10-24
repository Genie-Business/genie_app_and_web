import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * One Next app, two hostnames.
 *
 *  - Public host(s) (the default): the marketing site, wishlist pages, legal pages.
 *    `/admin/*` must not exist here — it's the same code, but only the admin host may reach it.
 *  - Admin host(s) (`ADMIN_HOSTS`, comma-separated): every path is rewritten under `/admin`
 *    (so the browser sees admin.getgenie.gift/users while the route is /admin/users), and anyone
 *    without a session cookie is bounced to /login. The cookie is host-only, so it never reaches
 *    the public host. Full JWT verification happens in the admin layout (Node runtime).
 */
const COOKIE = 'genie_admin_session';

function adminHosts(): string[] {
  return (process.env.ADMIN_HOSTS ?? 'admin.getgenie.gift,admin.localhost')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

const isAdminPath = (p: string) => p === '/admin' || p.startsWith('/admin/');

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  const { pathname } = req.nextUrl;
  const onAdminHost = adminHosts().includes(host);

  // The /admin prefix is an internal detail: it is never reachable directly, on any host.
  if (isAdminPath(pathname)) {
    return NextResponse.rewrite(new URL('/not-found-404', req.url), { status: 404 });
  }
  if (!onAdminHost) return NextResponse.next();

  if (!req.cookies.has(COOKIE) && pathname !== '/login') {
    // Built from the Host header (not req.url) so it stays on whichever admin hostname was used.
    return NextResponse.redirect(new URL('/login', `${req.nextUrl.protocol}//${req.headers.get('host')}`));
  }
  const url = req.nextUrl.clone();
  url.pathname = pathname === '/' ? '/admin' : `/admin${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except Next internals and the file-based metadata icons.
  matcher: ['/((?!_next/|favicon.ico|icon.png|apple-icon.png).*)'],
};
