import { transactionReference } from '@genie/core';
import { prisma } from '@genie/db';
import { getEnv } from '../../env';
import { logger } from '../../lib/logger';
import { notFound } from '../../lib/errors';
import { recordActivity } from '../activities/activities.service';
import { notify } from '../notifications/notify.service';
import { postEntry } from '../payments/ledger.service';
import { ensureWallet } from '../payments/wallet.service';

type ReferralConfig = { enabled: boolean; referrerKobo: bigint; refereeKobo: bigint };

const DEFAULT_CONFIG: ReferralConfig = {
  enabled: true,
  referrerKobo: 50_000n, // ₦500 to the referrer
  refereeKobo: 0n, // one-sided by default
};

let cache: { at: number; config: ReferralConfig } | null = null;
const TTL = 60_000;

export async function getReferralConfig(): Promise<ReferralConfig> {
  if (cache && Date.now() - cache.at < TTL) return cache.config;
  const row = await prisma.appSetting.findUnique({ where: { key: 'referral.reward' } });
  const v = (row?.value ?? {}) as Record<string, unknown>;
  const config: ReferralConfig = {
    enabled: v.enabled == null ? DEFAULT_CONFIG.enabled : Boolean(v.enabled),
    referrerKobo: v.referrerKobo == null ? DEFAULT_CONFIG.referrerKobo : BigInt(v.referrerKobo as number),
    refereeKobo: v.refereeKobo == null ? DEFAULT_CONFIG.refereeKobo : BigInt(v.refereeKobo as number),
  };
  cache = { at: Date.now(), config };
  return config;
}

export function invalidateReferralCache() {
  cache = null;
}

// ── Read ───────────────────────────────────────────────────────────────

export async function getMyReferrals(userId: string) {
  const [me, referrals, config] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } }),
    prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { referee: { select: { firstName: true, username: true } } },
    }),
    getReferralConfig(),
  ]);
  if (!me) throw notFound('User not found.');

  const rewarded = referrals.filter((r) => r.status === 'REWARDED');
  const signedUp = referrals.filter((r) => r.status === 'SIGNED_UP');
  const totalEarnedKobo = rewarded.reduce((s, r) => s + r.rewardKobo, 0n);

  return {
    code: me.referralCode,
    link: `${getEnv().APP_PUBLIC_URL.replace(/\/$/, '')}/join?ref=${me.referralCode}`,
    totalReferred: referrals.length,
    signedUp: signedUp.length,
    rewarded: rewarded.length,
    totalEarnedKobo,
    pendingRewardKobo: config.referrerKobo * BigInt(signedUp.length),
    rewardPerReferralKobo: config.referrerKobo,
    referees: referrals.map((r) => ({
      firstName: r.referee?.firstName ?? 'Someone',
      username: r.referee?.username ?? '',
      status: r.status,
      rewardKobo: r.rewardKobo,
      joinedAt: r.createdAt.toISOString(),
    })),
  };
}

// ── Reward ─────────────────────────────────────────────────────────────

/**
 * Called when a referred user completes a qualifying action (their first paid
 * gift). Idempotent: once a referral is REWARDED this is a no-op. Best-effort —
 * the caller wraps it so a reward failure never blocks the gift.
 */
export async function maybeRewardReferral(refereeUserId: string): Promise<void> {
  const config = await getReferralConfig();
  if (!config.enabled) return;
  if (config.referrerKobo <= 0n && config.refereeKobo <= 0n) return;

  const referral = await prisma.referral.findFirst({
    where: { refereeId: refereeUserId, status: 'SIGNED_UP' },
  });
  if (!referral) return;

  await ensureWallet(referral.referrerId);
  if (config.refereeKobo > 0n) await ensureWallet(refereeUserId);

  try {
    await prisma.$transaction(
      async (tx) => {
        if (config.referrerKobo > 0n) {
          await postEntry(
            {
              userId: referral.referrerId,
              direction: 'CREDIT',
              amountKobo: config.referrerKobo,
              reason: 'REFERRAL',
              refType: 'Referral',
              refId: referral.id,
              narration: 'Referral reward',
              idempotencyKey: `referral:${referral.id}:referrer`,
            },
            tx,
          );
          await tx.transaction.create({
            data: {
              reference: transactionReference(),
              userId: referral.referrerId,
              type: 'REFERRAL',
              amountKobo: config.referrerKobo,
              status: 'COMPLETED',
              narration: `Referral reward for ${referral.id}`,
            },
          });
        }
        if (config.refereeKobo > 0n) {
          await postEntry(
            {
              userId: refereeUserId,
              direction: 'CREDIT',
              amountKobo: config.refereeKobo,
              reason: 'REFERRAL',
              refType: 'Referral',
              refId: referral.id,
              narration: 'Welcome bonus (referred sign-up)',
              idempotencyKey: `referral:${referral.id}:referee`,
            },
            tx,
          );
          await tx.transaction.create({
            data: {
              reference: transactionReference(),
              userId: refereeUserId,
              type: 'REFERRAL',
              amountKobo: config.refereeKobo,
              status: 'COMPLETED',
              narration: `Referral welcome bonus for ${referral.id}`,
            },
          });
        }
        await tx.referral.update({
          where: { id: referral.id },
          data: { status: 'REWARDED', rewardKobo: config.referrerKobo, rewardedAt: new Date() },
        });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (err) {
    logger.error({ err, referralId: referral.id }, 'referral reward failed');
    return;
  }

  const referee = await prisma.user.findUnique({
    where: { id: refereeUserId },
    select: { firstName: true, username: true },
  });

  if (config.referrerKobo > 0n) {
    await notify({
      userId: referral.referrerId,
      type: 'referral.rewarded',
      title: 'Referral reward 🎉',
      body: `${referee?.firstName ?? 'Someone you referred'} made their first gift — ₦${(
        Number(config.referrerKobo) / 100
      ).toLocaleString()} is in your wallet.`,
      payload: { referralId: referral.id },
    });
    await recordActivity({
      userId: referral.referrerId,
      category: 'TRANSACTION',
      action: 'referral.rewarded',
      entityType: 'Referral',
      entityId: referral.id,
      metadata: { amountKobo: config.referrerKobo.toString(), refereeUsername: referee?.username },
    });
  }
  if (config.refereeKobo > 0n) {
    await notify({
      userId: refereeUserId,
      type: 'referral.rewarded',
      title: 'Welcome bonus 🎁',
      body: `₦${(Number(config.refereeKobo) / 100).toLocaleString()} welcome bonus is in your wallet.`,
      payload: { referralId: referral.id },
    });
  }
  logger.info({ referralId: referral.id }, 'referral rewarded');
}
