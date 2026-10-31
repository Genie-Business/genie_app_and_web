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

// ── Merchant signup token ────────────────────────────────────────────────
// Proof that someone controls an email address, handed out once they enter the
// code we emailed them. It is stateless (nothing to store) and deliberately a
// different token type and audience from an access token, so it can never be
// presented as a session.

const SIGNUP_TTL_SECONDS = 30 * 60;

export async function signMerchantSignupToken(email: string): Promise<{ token: string; expiresIn: number }> {
  const env = getEnv();
  const token = await new SignJWT({ typ: 'merchant-signup', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('genie-api')
    .setAudience('genie-merchant-signup')
    .setExpirationTime(`${SIGNUP_TTL_SECONDS}s`)
    .sign(enc.encode(env.JWT_ACCESS_SECRET));
  return { token, expiresIn: SIGNUP_TTL_SECONDS };
}

/** The verified email inside a signup token; throws if it is forged, expired or the wrong kind. */
export async function verifyMerchantSignupToken(token: string): Promise<{ email: string }> {
  const env = getEnv();
  const { payload } = await jwtVerify(token, enc.encode(env.JWT_ACCESS_SECRET), {
    issuer: 'genie-api',
    audience: 'genie-merchant-signup',
    algorithms: ['HS256'],
    clockTolerance: 5,
  });
  if (payload.typ !== 'merchant-signup' || typeof payload.email !== 'string') {
    throw new Error('Not a merchant signup token');
  }
  return { email: payload.email };
}
