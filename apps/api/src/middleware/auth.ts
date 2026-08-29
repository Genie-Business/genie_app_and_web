import type { Context, MiddlewareHandler } from 'hono';
import { prisma, type UserRole } from '@genie/db';
import type { AppEnv, AuthUser } from '../types';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';

async function loadUser(token: string): Promise<AuthUser> {
  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, role: true, email: true, username: true, emailVerifiedAt: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') {
    throw unauthorized('Account not found.');
  }
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    username: user.username,
    emailVerified: user.emailVerifiedAt != null,
  };
}

function bearer(c: Context): string | null {
  const header = c.req.header('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Require a valid access token. Populates `c.get('user')`. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearer(c);
  if (!token) throw unauthorized();
  c.set('user', await loadUser(token));
  await next();
};

/** Populate `c.get('user')` when a token is present, but don't require it. */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearer(c);
  if (token) {
    try {
      c.set('user', await loadUser(token));
    } catch {
      /* ignore — treat as anonymous */
    }
  }
  await next();
};

/** Require the authenticated user to hold one of the given roles. */
export function requireRole(...roles: UserRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) throw unauthorized();
    if (!roles.includes(user.role)) {
      throw forbidden(`This action is only available to ${roles.join(' / ').toLowerCase()} accounts.`);
    }
    await next();
  };
}

/** Require the authenticated user to have a verified email. */
export const requireVerifiedEmail: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) throw unauthorized();
  if (!user.emailVerified) {
    throw forbidden('Please verify your email address to continue.');
  }
  await next();
};
