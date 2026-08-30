import { prisma, type Prisma } from '@genie/db';
import type { messages as M } from '@genie/contracts';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { notify } from '../notifications/notify.service';

const CARD = { id: true, firstName: true, lastName: true, username: true } as const;

/** Canonical participant order so a pair maps to exactly one thread row. */
function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function assertCanMessage(meId: string, otherId: string) {
  if (meId === otherId) throw badRequest('You cannot message yourself.');
  const edge = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: meId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: meId },
      ],
    },
  });
  if (!edge || edge.status === 'PENDING') {
    throw forbidden('You can only message people you are friends with.');
  }
  if (edge.status === 'BLOCKED') throw forbidden('You cannot message this person.');
}

async function resolveUser(input: M.StartThreadBody) {
  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId }, select: CARD })
    : await prisma.user.findFirst({ where: { username: input.username, status: 'ACTIVE' }, select: CARD });
  if (!user) throw notFound('No genie user with that username.');
  return user;
}

const THREAD_INCLUDE = {
  participantA: { select: CARD },
  participantB: { select: CARD },
} satisfies Prisma.MessageThreadInclude;

type ThreadRow = Prisma.MessageThreadGetPayload<{ include: typeof THREAD_INCLUDE }>;

async function summarize(t: ThreadRow, meId: string): Promise<M.ThreadSummaryDto> {
  const other = t.participantAId === meId ? t.participantB : t.participantA;
  const [last, unreadCount] = await Promise.all([
    prisma.message.findFirst({ where: { threadId: t.id }, orderBy: { createdAt: 'desc' } }),
    prisma.message.count({ where: { threadId: t.id, senderId: { not: meId }, readAt: null } }),
  ]);
  return {
    id: t.id,
    withUser: { userId: other.id, firstName: other.firstName, lastName: other.lastName, username: other.username },
    lastMessage: last ? last.body.slice(0, 120) : null,
    lastMessageAt: t.lastMessageAt.toISOString(),
    unreadCount,
  };
}

async function loadOwnThread(meId: string, threadId: string) {
  const t = await prisma.messageThread.findUnique({ where: { id: threadId }, include: THREAD_INCLUDE });
  if (!t || (t.participantAId !== meId && t.participantBId !== meId)) throw notFound('Conversation not found.');
  return t;
}

// ── Public API ─────────────────────────────────────────────────────────

export async function startThread(meId: string, input: M.StartThreadBody) {
  const other = await resolveUser(input);
  await assertCanMessage(meId, other.id);
  const [a, b] = pair(meId, other.id);
  const thread = await prisma.messageThread.upsert({
    where: { participantAId_participantBId: { participantAId: a, participantBId: b } },
    create: { participantAId: a, participantBId: b },
    update: {},
    include: THREAD_INCLUDE,
  });
  return summarize(thread, meId);
}

export async function listThreads(meId: string, q: { page: number; pageSize: number }) {
  const where: Prisma.MessageThreadWhereInput = {
    OR: [{ participantAId: meId }, { participantBId: meId }],
  };
  const [rows, total] = await Promise.all([
    prisma.messageThread.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: THREAD_INCLUDE,
    }),
    prisma.messageThread.count({ where }),
  ]);
  const data = await Promise.all(rows.map((t) => summarize(t, meId)));
  return { data, meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) } };
}

export async function getThread(meId: string, threadId: string, q: { page: number; pageSize: number }) {
  const t = await loadOwnThread(meId, threadId);
  const rows = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: 'desc' },
    skip: (q.page - 1) * q.pageSize,
    take: q.pageSize,
  });
  // Reading a thread clears the caller's unread messages in it.
  await prisma.message.updateMany({
    where: { threadId, senderId: { not: meId }, readAt: null },
    data: { readAt: new Date() },
  });
  const summary = await summarize(t, meId);
  return {
    ...summary,
    unreadCount: 0,
    messages: rows
      .reverse()
      .map((m) => ({
        id: m.id,
        mine: m.senderId === meId,
        body: m.body,
        read: m.readAt != null,
        createdAt: m.createdAt.toISOString(),
      })),
  };
}

export async function sendMessage(meId: string, threadId: string, input: M.SendMessageBody) {
  const t = await loadOwnThread(meId, threadId);
  const otherId = t.participantAId === meId ? t.participantBId : t.participantAId;
  await assertCanMessage(meId, otherId);

  // Only ping once per "conversation went unread", not per message.
  const alreadyUnread = await prisma.message.count({
    where: { threadId, senderId: meId, readAt: null },
  });

  await prisma.message.create({ data: { threadId, senderId: meId, body: input.body } });
  await prisma.messageThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });

  if (alreadyUnread === 0) {
    const me = await prisma.user.findUnique({ where: { id: meId }, select: CARD });
    await notify({
      userId: otherId,
      type: 'message.new',
      title: `New message from ${me?.firstName ?? 'a friend'}`,
      body: input.body.slice(0, 140),
      payload: { threadId, fromUserId: meId },
    });
  }

  return getThread(meId, threadId, { page: 1, pageSize: 50 });
}

export async function markThreadRead(meId: string, threadId: string) {
  await loadOwnThread(meId, threadId);
  const res = await prisma.message.updateMany({
    where: { threadId, senderId: { not: meId }, readAt: null },
    data: { readAt: new Date() },
  });
  return { read: res.count };
}

export async function unreadTotal(meId: string) {
  return prisma.message.count({
    where: {
      readAt: null,
      senderId: { not: meId },
      thread: { OR: [{ participantAId: meId }, { participantBId: meId }] },
    },
  });
}
