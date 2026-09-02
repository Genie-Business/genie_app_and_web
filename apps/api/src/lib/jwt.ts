import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from '../env';

const enc = new TextEncoder();

export type AccessClaims = {
  sub: string;
  role: 'CELEBRANT' | 'MERCHANT';
  typ: 'access';
};

export async function signAccessToken(userId: string, role: AccessClaims['role']): Promise<string> {
  const env = getEnv();
  return new SignJWT({ role, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('genie-api')
    .setAudience('genie-app')
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL}s`)
    .sign(enc.encode(env.JWT_ACCESS_SECRET));
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const env = getEnv();
  const { payload } = await jwtVerify(token, enc.encode(env.JWT_ACCESS_SECRET), {
    issuer: 'genie-api',
    audience: 'genie-app',
    algorithms: ['HS256'], // reject alg:none / algorithm-confusion outright
    clockTolerance: 5,
    maxTokenAge: `${env.ACCESS_TOKEN_TTL + 60}s`,
  });
  if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
    throw new Error('Not an access token');
  }
  return { sub: payload.sub, role: payload.role as AccessClaims['role'], typ: 'access' };
}

/**
 * Refresh tokens are opaque random strings stored (hashed) in the DB so they
 * can be revoked and rotated. jose only signs the *access* token.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
