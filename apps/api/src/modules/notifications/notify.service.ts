import { prisma, type NotificationCategory, type Prisma } from '@genie/db';
import type { notifications as N } from '@genie/contracts';
import { sendMail, type Mail } from '../../lib/mailer';
import { logger } from '../../lib/logger';
import { getPushSender } from './push';

const CATEGORIES: NotificationCategory[] = ['GIFT', 'EVENT', 'FRIEND', 'PAYMENT', 'MESSAGE', 'SYSTEM'];

/** Map a dotted notification `type` to its preference category. */
export function categoryForType(type: string): NotificationCategory {
  const head = type.split('.')[0];
  switch (head) {
    case 'gift':
    case 'order':
      return 'GIFT';
    case 'event':
    case 'wishlist':
      return 'EVENT';
    case 'friend':
      return 'FRIEND';
    case 'message':
      return 'MESSAGE';
    case 'payment':
    case 'payout':
    case 'withdrawal':
    case 'wallet':
    case 'referral':
      return 'PAYMENT';
    default:
      return 'SYSTEM';
  }
}

type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  payload?: Prisma.InputJsonValue;
  category?: NotificationCategory;
  /** When the user has email delivery enabled for this category, send this. */
  email?: Omit<Mail, 'to'>;
};

/**
 * Create an in-app notification and fan out to push / email per the user's
 * preferences. Never throws into the caller — a delivery failure is logged and
 * the in-app row still stands.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const category = input.category ?? categoryForType(input.type);
  try {
    const row = await prisma.notification.create({
      data: {
        userId: input.userId,
        channel: 'IN_APP',
        category,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload,
      },
    });

    const pref = await resolvePreference(input.userId, category);
    const sideChannels: string[] = [];

    if (pref.push) {
      const tokens = await prisma.deviceToken.findMany({
        where: { userId: input.userId },
        select: { fcmToken: true },
      });
      if (tokens.length) {
        const res = await getPushSender()
          .send(tokens.map((t) => t.fcmToken), {
            title: input.title,
            body: input.body,
            data: { type: input.type, notificationId: row.id, category },
          })
          .catch((err) => {
            logger.warn({ err: (err as Error).message, userId: input.userId }, 'push send failed');
            return null;
          });
        if (res) {
          sideChannels.push('push');
          if (res.invalidTokens.length) {
            await prisma.deviceToken
              .deleteMany({ where: { fcmToken: { in: res.invalidTokens } } })
              .catch(() => undefined);
          }
        }
      }
    }

    if (pref.email && input.email) {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      });
      if (user?.email) {
        await sendMail({ ...input.email, to: user.email }).then(
          () => sideChannels.push('email'),
          (err) => logger.warn({ err: (err as Error).message }, 'notification email failed'),
        );
      }
    }

    if (sideChannels.length) {
      await prisma.notification.update({ where: { id: row.id }, data: { sentAt: new Date() } });
    }
  } catch (err) {
    logger.error({ err, userId: input.userId, type: input.type }, 'notify() failed');
  }
}

/** Notify several users of the same thing (e.g. broadcast). Best-effort. */
export async function notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
  await Promise.all(userIds.map((userId) => notify({ ...input, userId })));
}

// ── Preferences ────────────────────────────────────────────────────────

type Pref = { category: NotificationCategory; push: boolean; email: boolean; inApp: true };

const DEFAULT_PREF = (category: NotificationCategory): Pref => ({
  category,
  push: true,
  email: false,
  inApp: true,
});

async function resolvePreference(userId: string, category: NotificationCategory): Promise<Pref> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId_category: { userId, category } },
  });
  return row ? { category, push: row.push, email: row.email, inApp: true } : DEFAULT_PREF(category);
}

export async function getPreferences(userId: string): Promise<Pref[]> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const byCat = new Map(rows.map((r) => [r.category, r]));
  return CATEGORIES.map((category) => {
    const r = byCat.get(category);
    return r
      ? { category, push: r.push, email: r.email, inApp: true as const }
      : DEFAULT_PREF(category);
  });
}

export async function updatePreferences(
  userId: string,
  input: N.UpdatePreferencesBody,
): Promise<Pref[]> {
  await prisma.$transaction(
    input.preferences.map((p) =>
      prisma.notificationPreference.upsert({
        where: { userId_category: { userId, category: p.category } },
        create: {
          userId,
          category: p.category,
          push: p.push ?? true,
          email: p.email ?? false,
        },
        update: {
          ...(p.push == null ? {} : { push: p.push }),
          ...(p.email == null ? {} : { email: p.email }),
        },
      }),
    ),
  );
  return getPreferences(userId);
}

// ── Feed ───────────────────────────────────────────────────────────────

export type NotificationQuery = {
  unreadOnly: boolean;
  category?: NotificationCategory;
  page: number;
  pageSize: number;
};

export async function listNotifications(userId: string, q: NotificationQuery) {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(q.unreadOnly ? { readAt: null } : {}),
    ...(q.category ? { category: q.category } : {}),
  };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    data: rows.map((n) => ({
      id: n.id,
      category: n.category,
      type: n.type,
      title: n.title,
      body: n.body,
      payload: (n.payload as Record<string, unknown> | null) ?? null,
      read: n.readAt != null,
      createdAt: n.createdAt.toISOString(),
    })),
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
      unreadCount: unread,
    },
  };
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, body: N.MarkReadBody): Promise<number> {
  const res = await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(body.all ? {} : { id: { in: body.ids ?? [] } }),
    },
    data: { readAt: new Date() },
  });
  return res.count;
}
