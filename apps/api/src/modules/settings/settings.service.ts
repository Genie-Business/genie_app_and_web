import { prisma } from '@genie/db';
import type { settings as S } from '@genie/contracts';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { otpEmail, sendMail } from '../../lib/mailer';
import { consumeOtp, issueOtp, otpEchoEnabled } from '../auth/auth.service';
import { recordActivity } from '../activities/activities.service';
import { getBalanceKobo } from '../payments/ledger.service';

// ── Reference data ─────────────────────────────────────────────────────

export async function getAllowedCountries(): Promise<S.AllowedCountryDto[]> {
  const rows = await prisma.allowedCountry.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    callingCode: r.callingCode,
    states: r.states,
  }));
}

// ── Profile (non-identity fields only) ─────────────────────────────────

export async function updateProfile(userId: string, input: S.UpdateProfileBody) {
  const data = {
    ...(input.dateOfBirth ? { dateOfBirth: new Date(input.dateOfBirth) } : {}),
    ...(input.stateOfResidence ? { stateOfResidence: input.stateOfResidence } : {}),
    ...(input.addressLine ? { addressLine: input.addressLine } : {}),
    ...(input.lga ? { lga: input.lga } : {}),
    ...(input.city ? { city: input.city } : {}),
  };
  if (input.dateOfBirth) {
    const age = (Date.now() - new Date(input.dateOfBirth).getTime()) / 31_557_600_000;
    if (age < 13 || age > 120) throw badRequest('Enter a valid date of birth.');
  }
  await prisma.user.update({ where: { id: userId }, data });
  await recordActivity({ userId, category: 'ACCOUNT', action: 'profile.updated', metadata: { fields: Object.keys(data) } });
  return { updated: Object.keys(data) };
}

// ── Sessions / devices ────────────────────────────────────────────────

export async function listSessions(userId: string, currentDeviceId?: string): Promise<S.SessionDto[]> {
  const rows = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    deviceId: r.deviceId,
    deviceName: r.deviceName,
    userAgent: r.userAgent,
    current: currentDeviceId != null && r.deviceId === currentDeviceId,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function revokeSession(userId: string, sessionId: string) {
  const row = await prisma.refreshToken.findUnique({ where: { id: sessionId } });
  if (!row || row.userId !== userId) throw notFound('Session not found.');
  if (row.revokedAt) return;
  await prisma.refreshToken.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  await recordActivity({ userId, category: 'ACCOUNT', action: 'session.revoked', entityId: sessionId });
}

/** Sign out everywhere except the caller's own device. */
export async function revokeOtherSessions(userId: string, keepDeviceId: string) {
  const res = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null, deviceId: { not: keepDeviceId } },
    data: { revokedAt: new Date() },
  });
  await recordActivity({ userId, category: 'ACCOUNT', action: 'session.revoked_others', metadata: { count: res.count } });
  return { revoked: res.count };
}

// ── Account deletion (E011 / US "Delete account") ─────────────────────

async function assertDeletable(userId: string) {
  const balance = await getBalanceKobo(userId);
  if (balance > 0n) {
    throw badRequest(
      `Withdraw your ₦${(Number(balance) / 100).toLocaleString()} wallet balance before deleting your account.`,
    );
  }
  const pendingPayout = await prisma.payout.findFirst({
    where: { merchantId: userId, status: { in: ['PENDING', 'PROCESSING'] } },
    select: { id: true },
  });
  if (pendingPayout) throw badRequest('You have a settlement in progress. Try again once it completes.');
}

export async function requestDeletion(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, status: true },
  });
  if (user.status !== 'ACTIVE') throw conflict('already_deleted', 'This account is already closed.');
  await assertDeletable(userId);

  const code = await issueOtp(user.email, 'ACCOUNT_DELETE', userId);
  await sendMail({ ...otpEmail(code, 'delete'), to: user.email });
  logger.info({ userId }, 'account deletion requested');
  return {
    message: 'We sent a confirmation code to your email. Enter it to permanently close your account.',
    ...(otpEchoEnabled(user.email) ? { verificationCode: code } : {}),
  };
}

export async function confirmDeletion(userId: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, username: true, status: true, originalEmail: true },
  });
  if (user.status !== 'ACTIVE') throw conflict('already_deleted', 'This account is already closed.');

  const otpUserId = await consumeOtp(user.email, 'ACCOUNT_DELETE', code);
  if (otpUserId && otpUserId !== userId) throw badRequest('That code is not valid for this account.');

  await assertDeletable(userId);

  // Tombstone the identity fields so the email / username can be reused, but keep
  // the row (transactions, gifts and orders must survive). The full user id keeps
  // both tombstones unique.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deletionReason: 'user_requested',
        email: `deleted+${user.id}@genie.deleted`,
        username: `del_${user.id}`,
        originalEmail: user.originalEmail ?? user.email,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.deviceToken.deleteMany({ where: { userId } }),
  ]);

  await recordActivity({ userId, category: 'ACCOUNT', action: 'account.deleted' });
  logger.info({ userId }, 'account deleted');
  return { message: 'Your account has been permanently deleted.' };
}
