import { prisma, type Prisma } from '@genie/db';
import type { support as SP } from '@genie/contracts';
import { badRequest, notFound } from '../../lib/errors';
import { recordActivity } from '../activities/activities.service';

const THREAD_INCLUDE = {
  messages: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.SupportThreadInclude;

type ThreadFull = Prisma.SupportThreadGetPayload<{ include: typeof THREAD_INCLUDE }>;

function summarize(t: ThreadFull, withMessages = false): SP.SupportThreadDto {
  const last = t.messages[t.messages.length - 1];
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    messageCount: t.messages.length,
    lastMessageAt: (last?.createdAt ?? t.createdAt).toISOString(),
    createdAt: t.createdAt.toISOString(),
    ...(withMessages
      ? {
          messages: t.messages.map((m) => ({
            id: m.id,
            from: m.senderType,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
          })),
        }
      : {}),
  };
}

const OPEN_STATUSES = ['OPEN', 'PENDING'] as const;

export async function createThread(userId: string, input: SP.CreateSupportThreadBody) {
  const openCount = await prisma.supportThread.count({
    where: { userId, status: { in: [...OPEN_STATUSES] } },
  });
  if (openCount >= 5) {
    throw badRequest('You already have several open conversations. Please continue one of those.');
  }
  const thread = await prisma.supportThread.create({
    data: {
      userId,
      subject: input.subject ?? null,
      status: 'OPEN',
      messages: { create: { senderType: 'USER', senderUserId: userId, body: input.message } },
    },
    include: THREAD_INCLUDE,
  });
  await recordActivity({ userId, category: 'APP', action: 'support.opened', entityType: 'SupportThread', entityId: thread.id });
  return summarize(thread, true);
}

export async function listThreads(userId: string) {
  const rows = await prisma.supportThread.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: THREAD_INCLUDE,
  });
  return rows.map((t) => summarize(t));
}

async function ownThread(userId: string, id: string) {
  const thread = await prisma.supportThread.findUnique({ where: { id }, include: THREAD_INCLUDE });
  if (!thread || thread.userId !== userId) throw notFound('Conversation not found.');
  return thread;
}

export async function getThread(userId: string, id: string) {
  return summarize(await ownThread(userId, id), true);
}

export async function addMessage(userId: string, id: string, input: SP.SupportMessageBody) {
  const thread = await ownThread(userId, id);
  if (thread.status === 'CLOSED') throw badRequest('This conversation is closed. Start a new one.');
  await prisma.supportMessage.create({
    data: { threadId: id, senderType: 'USER', senderUserId: userId, body: input.message },
  });
  // A user reply re-opens a resolved thread for the support team.
  await prisma.supportThread.update({
    where: { id },
    data: { status: thread.status === 'RESOLVED' ? 'OPEN' : thread.status, updatedAt: new Date() },
  });
  return getThread(userId, id);
}
