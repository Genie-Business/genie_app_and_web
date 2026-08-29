import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Cheap gate: bounce anyone without a session cookie away from app routes.
 * Full JWT verification happens in the dashboard layout (Node runtime).
 */
export function middleware(req: NextRequest) {
  const hasCookie = req.cookies.has('genie_admin_session');
  const { pathname } = req.nextUrl;
  if (!hasCookie && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
};
