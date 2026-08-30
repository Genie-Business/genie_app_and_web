import { prisma, type ActivityCategory, type Prisma } from '@genie/db';
import type { activities as A } from '@genie/contracts';
import { logger } from '../../lib/logger';

type RecordInput = {
  userId: string;
  category: ActivityCategory;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Append to the user's activity feed. Best-effort — a logging failure must never
 * break the action that triggered it.
 */
export async function recordActivity(input: RecordInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: input.userId,
        category: input.category,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      },
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, action: input.action }, 'recordActivity failed');
  }
}

/** Human-readable one-liner for a feed row. */
function titleFor(action: string, meta: Record<string, unknown> | null): string {
  const naira = (k: unknown) => `₦${(Number(k) / 100).toLocaleString()}`;
  switch (action) {
    case 'account.registered':
      return 'You joined genie';
    case 'account.verified':
      return 'You verified your email';
    case 'event.created':
      return `You created an event${meta?.name ? ` — ${meta.name}` : ''}`;
    case 'event.deleted':
      return 'You deleted an event';
    case 'wallet.funded':
      return `You added ${naira(meta?.amountKobo)} to your wallet`;
    case 'gift.paid':
      return `You sent a gift${meta?.amountKobo ? ` (${naira(meta.amountKobo)})` : ''}`;
    case 'gift.received':
      return 'You received a gift';
    case 'gift.revealed':
      return 'You revealed an anonymous gift';
    case 'withdrawal.completed':
      return `You withdrew ${naira(meta?.amountKobo)} to your bank`;
    case 'friend.added':
      return `You and ${meta?.username ? `@${meta.username}` : 'a friend'} are now friends`;
    case 'referral.rewarded':
      return `You earned ${naira(meta?.amountKobo)} from a referral`;
    default:
      return action.replace(/[._]/g, ' ');
  }
}

export async function listActivities(userId: string, q: A.ActivityListQuery) {
  const where: Prisma.ActivityLogWhereInput = {
    userId,
    ...(q.category ? { category: q.category } : {}),
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.from || q.to
      ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);
  return {
    data: rows.map((r) => {
      const metadata = (r.metadata as Record<string, unknown> | null) ?? null;
      return {
        id: r.id,
        category: r.category,
        action: r.action,
        title: titleFor(r.action, metadata),
        entityType: r.entityType,
        entityId: r.entityId,
        metadata,
        createdAt: r.createdAt.toISOString(),
      };
    }),
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
  };
}
