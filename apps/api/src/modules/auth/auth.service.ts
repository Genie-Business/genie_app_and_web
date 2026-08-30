import { randomBytes } from 'node:crypto';
import {
  generateOtp,
  hashOtp,
  hashPassword,
  normalizeEmail,
  randomCode,
  verifyOtp,
  verifyPassword,
} from '@genie/core';
import { prisma, type OtpPurpose, type User } from '@genie/db';
import type { auth as authContracts } from '@genie/contracts';
import { getEnv, otpPepper } from '../../env';
import { badRequest, conflict, notFound, tooManyRequests, unauthorized } from '../../lib/errors';
import { hashRefreshToken, signAccessToken } from '../../lib/jwt';
import { otpEmail, sendMail } from '../../lib/mailer';
import { logger } from '../../lib/logger';
import { recordActivity } from '../activities/activities.service';

type RegisterCelebrant = authContracts.RegisterCelebrantBody;
type RegisterMerchant = authContracts.RegisterMerchantBody;
type DeviceCtx = { deviceId: string; deviceName?: string; userAgent?: string; ip?: string };

export type TokenBundle = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  tokenType: 'Bearer';
};

// ── OTP helpers ──────────────────────────────────────────────────────────

/**
 * The most recent plaintext OTP per `${purpose}:${email}`. Populated only in
 * tests and when APP_ENV=local (never in preview/production) so the test console
 * can read back a code instead of scraping the server log.
 */
export const __lastOtp = new Map<string, string>();

function otpIsPeekable(env: ReturnType<typeof getEnv>): boolean {
  return process.env.NODE_ENV === 'test' || env.APP_ENV === 'local';
}

/** Dev/test only: last code for an email + purpose, or null. */
export function peekOtp(email: string, purpose: OtpPurpose = 'EMAIL_VERIFY'): string | null {
  if (!otpIsPeekable(getEnv())) return null;
  return __lastOtp.get(`${purpose}:${normalizeEmail(email)}`) ?? null;
}

async function issueOtp(email: string, purpose: OtpPurpose, userId?: string): Promise<string> {
  const env = getEnv();
  const code = generateOtp(6);
  // Invalidate any outstanding codes for this (email, purpose).
  await prisma.otpToken.deleteMany({ where: { email, purpose, consumedAt: null } });
  await prisma.otpToken.create({
    data: {
      email,
      userId: userId ?? null,
      purpose,
      codeHash: hashOtp(code, otpPepper()),
      expiresAt: new Date(Date.now() + env.OTP_TTL * 1000),
    },
  });
  if (otpIsPeekable(env)) __lastOtp.set(`${purpose}:${email}`, code);
  return code;
}

async function consumeOtp(email: string, purpose: OtpPurpose, code: string): Promise<string | null> {
  const env = getEnv();
  const token = await prisma.otpToken.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!token) throw badRequest('That code is invalid or has expired. Request a new one.');
  if (token.expiresAt.getTime() < Date.now()) {
    throw badRequest('That code has expired. Request a new one.');
  }
  if (token.attemptCount >= env.OTP_MAX_ATTEMPTS) {
    throw tooManyRequests('Too many incorrect attempts. Request a new code.');
  }
  if (!verifyOtp(code, token.codeHash, otpPepper())) {
    await prisma.otpToken.update({
      where: { id: token.id },
      data: { attemptCount: { increment: 1 } },
    });
    throw badRequest('That code is incorrect.');
  }
  await prisma.otpToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
  return token.userId;
}

// ── Token issuance ───────────────────────────────────────────────────────

async function issueTokens(user: Pick<User, 'id' | 'role'>, device: DeviceCtx): Promise<TokenBundle> {
  const env = getEnv();
  const accessToken = await signAccessToken(user.id, user.role);
  const refreshToken = randomBytes(48).toString('base64url');

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      userAgent: device.userAgent,
      ipAddress: device.ip,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: env.ACCESS_TOKEN_TTL,
    tokenType: 'Bearer',
  };
}

// ── Registration ─────────────────────────────────────────────────────────

async function assertEmailAndUsernameFree(email: string, username: string): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }], status: 'ACTIVE' },
    select: { email: true, username: true },
  });
  if (existing?.email === email) throw conflict('email_taken', 'An account with this email already exists.');
  if (existing?.username === username) {
    throw conflict('username_taken', 'That username is already taken.');
  }
}

async function resolveReferrer(code: string | undefined): Promise<string | null> {
  if (!code) return null;
  const referrer = await prisma.user.findFirst({
    where: { status: 'ACTIVE', referralCode: code.trim().toUpperCase() },
    select: { id: true },
  });
  if (!referrer) throw badRequest('That referral code is not valid.');
  return referrer.id;
}

async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 6; i += 1) {
    const code = `GEN${randomCode(6)}`;
    const clash = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  return `GEN${randomCode(9)}`;
}

export async function registerCelebrant(input: RegisterCelebrant) {
  const email = normalizeEmail(input.email);
  const username = input.username.trim();
  await assertEmailAndUsernameFree(email, username);
  const referredById = await resolveReferrer(input.referralCode);
  const passwordHash = await hashPassword(input.password);
  const referralCode = await uniqueReferralCode();

  const user = await prisma.user.create({
    data: {
      role: 'CELEBRANT',
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      username,
      referralCode,
      phone: input.phone,
      passwordHash,
      stateOfResidence: input.stateOfResidence,
      country: input.country,
      referredById,
    },
  });

  if (referredById) {
    await prisma.referral.create({
      data: {
        referrerId: referredById,
        refereeId: user.id,
        code: input.referralCode!.trim().toUpperCase(),
        status: 'SIGNED_UP',
      },
    });
  }

  await recordActivity({ userId: user.id, category: 'ACCOUNT', action: 'account.registered', metadata: { role: 'CELEBRANT' } });
  const code = await issueOtp(email, 'EMAIL_VERIFY', user.id);
  await sendMail({ ...otpEmail(code, 'verify'), to: email });
  logger.info({ userId: user.id }, 'celebrant registered');
  return { userId: user.id, email };
}

export async function registerMerchant(input: RegisterMerchant) {
  const email = normalizeEmail(input.email);
  const username = input.username.trim();
  await assertEmailAndUsernameFree(email, username);

  const invite = await prisma.merchantInviteCode.findUnique({
    where: { code: input.confirmationCode.trim() },
  });
  if (!invite || invite.usedByUserId || (invite.expiresAt && invite.expiresAt.getTime() < Date.now())) {
    throw badRequest('That confirmation code is invalid or has already been used.');
  }

  const passwordHash = await hashPassword(input.password);
  const referralCode = await uniqueReferralCode();

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        role: 'MERCHANT',
        firstName: input.businessName.trim(),
        lastName: '(Merchant)',
        email,
        username,
        referralCode,
        phone: input.businessPhone,
        passwordHash,
        stateOfResidence: input.businessState,
        country: input.country,
        merchantProfile: {
          create: {
            businessName: input.businessName.trim(),
            businessPhone: input.businessPhone,
            businessState: input.businessState,
            bankName: input.bankName,
            bankAccountNumber: input.bankAccountNumber,
            bankAccountName: input.bankAccountName,
            inviteCodeId: invite.id,
          },
        },
      },
    });
    await tx.merchantInviteCode.update({
      where: { id: invite.id },
      data: { usedByUserId: created.id, usedAt: new Date() },
    });
    return created;
  });

  await recordActivity({ userId: user.id, category: 'ACCOUNT', action: 'account.registered', metadata: { role: 'MERCHANT' } });
  const code = await issueOtp(email, 'EMAIL_VERIFY', user.id);
  await sendMail({ ...otpEmail(code, 'verify'), to: email });
  logger.info({ userId: user.id }, 'merchant registered');
  return { userId: user.id, email };
}

// ── Email verification ───────────────────────────────────────────────────

export async function verifyEmail(rawEmail: string, code: string, device: DeviceCtx) {
  const email = normalizeEmail(rawEmail);
  const userId = await consumeOtp(email, 'EMAIL_VERIFY', code);
  const user = await prisma.user.findFirst({ where: { email, status: 'ACTIVE' } });
  if (!user || (userId && userId !== user.id)) throw notFound('Account not found.');

  if (!user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    await recordActivity({ userId: user.id, category: 'ACCOUNT', action: 'account.verified' });
  }
  const tokens = await issueTokens(user, device);
  return { tokens, user };
}

export async function resendOtp(rawEmail: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET') {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findFirst({ where: { email, status: 'ACTIVE' } });
  // Don't leak whether the account exists.
  if (!user) return;
  if (purpose === 'EMAIL_VERIFY' && user.emailVerifiedAt) return;
  const code = await issueOtp(email, purpose, user.id);
  await sendMail({ ...otpEmail(code, purpose === 'EMAIL_VERIFY' ? 'verify' : 'reset'), to: email });
}

// ── Login / refresh / logout ─────────────────────────────────────────────

export async function login(identifier: string, password: string, device: DeviceCtx) {
  const id = identifier.trim();
  const user = await prisma.user.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [{ email: normalizeEmail(id) }, { username: id }],
    },
  });
  // Uniform failure to avoid user enumeration + timing differences.
  const hash = user?.passwordHash ?? '$scrypt$0$0$0$AA==$AA==';
  const passwordOk = await verifyPassword(password, hash);
  if (!user || !passwordOk) {
    throw unauthorized('The email/username or password is incorrect.');
  }

  const tokens = await issueTokens(user, device);
  await prisma.user.update({ where: { id: user.id }, data: { updatedAt: new Date() } });
  return { tokens, user };
}

export async function refresh(refreshToken: string, device: DeviceCtx) {
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
  if (stored.user.status !== 'ACTIVE') throw unauthorized('Account not found.');

  // Rotate: revoke the old token, issue a fresh pair for the same device.
  const next = await issueTokens(stored.user, { ...device, deviceId: stored.deviceId });
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: {
      revokedAt: new Date(),
      lastUsedAt: new Date(),
      replacedByTokenHash: hashRefreshToken(next.refreshToken),
    },
  });
  return { tokens: next, user: stored.user };
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken
    .updateMany({
      where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => undefined);
}

// ── Password reset ───────────────────────────────────────────────────────

export async function forgotPassword(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findFirst({ where: { email, status: 'ACTIVE' } });
  if (!user) return; // silent — no enumeration
  const code = await issueOtp(email, 'PASSWORD_RESET', user.id);
  await sendMail({ ...otpEmail(code, 'reset'), to: email });
}

export async function resetPassword(rawEmail: string, code: string, newPassword: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  await consumeOtp(email, 'PASSWORD_RESET', code);
  const user = await prisma.user.findFirst({ where: { email, status: 'ACTIVE' } });
  if (!user) throw notFound('Account not found.');

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    // Force re-login everywhere.
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

// ── Change password (authenticated) ──────────────────────────────────────

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('Account not found.');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest('Your current password is incorrect.');
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export const __testing = { issueOtp, consumeOtp, issueTokens };
