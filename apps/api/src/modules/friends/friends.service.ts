import { hashPhone, normalizePhoneNG } from '@genie/core';
import { prisma, type Friendship } from '@genie/db';
import type { friends as F } from '@genie/contracts';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { otpPepper } from '../../env';
import { recordActivity } from '../activities/activities.service';
import { notify } from '../notifications/notify.service';

const CARD = { id: true, firstName: true, lastName: true, username: true } as const;

/** The friendship row between two users, in whichever direction it exists. */
function edge(a: string, b: string) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
}

async function resolveTarget(input: F.SendFriendRequestBody) {
  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId }, select: CARD })
    : await prisma.user.findFirst({
        where: { username: input.username, status: 'ACTIVE' },
        select: CARD,
      });
  if (!user) throw notFound('No genie user with that username.');
  return user;
}

export async function sendRequest(meId: string, input: F.SendFriendRequestBody) {
  const target = await resolveTarget(input);
  if (target.id === meId) throw badRequest('You cannot add yourself.');

  const existing = await edge(meId, target.id);
  if (existing) {
    if (existing.status === 'ACCEPTED') throw conflict('already_friends', 'You are already friends.');
    if (existing.status === 'BLOCKED') {
      if (existing.requesterId === meId) {
        throw badRequest('You have blocked this user. Unblock them first.');
      }
      throw notFound('We could not send a request to that user.');
    }
    // PENDING
    if (existing.requesterId === meId) {
      throw conflict('request_pending', 'You already have a pending request to this user.');
    }
    // They already asked us — accept it.
    const accepted = await prisma.friendship.update({
      where: { id: existing.id },
      data: { status: 'ACCEPTED' },
    });
    await notifyAccepted(meId, existing.requesterId);
    return { status: 'accepted' as const, friendshipId: accepted.id };
  }

  const created = await prisma.friendship.create({
    data: { requesterId: meId, addresseeId: target.id, status: 'PENDING' },
  });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: meId }, select: CARD });
  await notify({
    userId: target.id,
    type: 'friend.request',
    title: 'New friend request',
    body: `${me.firstName} ${me.lastName} (@${me.username}) wants to be friends.`,
    payload: { friendshipId: created.id, fromUserId: meId },
  });
  logger.info({ meId, targetId: target.id }, 'friend request sent');
  return { status: 'sent' as const, friendshipId: created.id };
}

async function loadPending(requestId: string): Promise<Friendship> {
  const row = await prisma.friendship.findUnique({ where: { id: requestId } });
  if (!row || row.status !== 'PENDING') throw notFound('That friend request no longer exists.');
  return row;
}

export async function respondToRequest(meId: string, requestId: string, accept: boolean) {
  const row = await loadPending(requestId);
  if (row.addresseeId !== meId) throw forbidden('This request was not sent to you.');

  if (!accept) {
    await prisma.friendship.delete({ where: { id: row.id } });
    return { status: 'declined' as const };
  }
  await prisma.friendship.update({ where: { id: row.id }, data: { status: 'ACCEPTED' } });
  await notifyAccepted(meId, row.requesterId);
  return { status: 'accepted' as const };
}

async function notifyAccepted(accepterId: string, requesterId: string) {
  const [accepter, requester] = await Promise.all([
    prisma.user.findUnique({ where: { id: accepterId }, select: CARD }),
    prisma.user.findUnique({ where: { id: requesterId }, select: CARD }),
  ]);
  if (!accepter || !requester) return;
  await notify({
    userId: requesterId,
    type: 'friend.accepted',
    title: 'Friend request accepted',
    body: `${accepter.firstName} ${accepter.lastName} (@${accepter.username}) is now your friend.`,
    payload: { userId: accepterId },
  });
  await recordActivity({
    userId: accepterId,
    category: 'APP',
    action: 'friend.added',
    entityType: 'User',
    entityId: requesterId,
    metadata: { username: requester.username },
  });
  await recordActivity({
    userId: requesterId,
    category: 'APP',
    action: 'friend.added',
    entityType: 'User',
    entityId: accepterId,
    metadata: { username: accepter.username },
  });
}

export async function cancelRequest(meId: string, requestId: string) {
  const row = await loadPending(requestId);
  if (row.requesterId !== meId) throw forbidden('That is not your request to cancel.');
  await prisma.friendship.delete({ where: { id: row.id } });
}

export async function unfriend(meId: string, otherUserId: string) {
  const row = await edge(meId, otherUserId);
  if (!row || row.status !== 'ACCEPTED') throw notFound('You are not friends with that user.');
  await prisma.friendship.delete({ where: { id: row.id } });
}

export async function block(meId: string, otherUserId: string) {
  if (meId === otherUserId) throw badRequest('You cannot block yourself.');
  const target = await prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true } });
  if (!target) throw notFound('User not found.');
  await prisma.$transaction([
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: meId, addresseeId: otherUserId },
          { requesterId: otherUserId, addresseeId: meId },
        ],
      },
    }),
    prisma.friendship.create({
      data: { requesterId: meId, addresseeId: otherUserId, status: 'BLOCKED' },
    }),
  ]);
}

export async function unblock(meId: string, otherUserId: string) {
  const res = await prisma.friendship.deleteMany({
    where: { requesterId: meId, addresseeId: otherUserId, status: 'BLOCKED' },
  });
  if (res.count === 0) throw notFound('You have not blocked that user.');
}

// ── Reads ──────────────────────────────────────────────────────────────

export async function listFriends(meId: string) {
  const rows = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: meId }, { addresseeId: meId }],
    },
    orderBy: { updatedAt: 'desc' },
    include: { requester: { select: CARD }, addressee: { select: CARD } },
  });
  return rows.map((r) => {
    const u = r.requesterId === meId ? r.addressee : r.requester;
    return {
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      since: r.updatedAt.toISOString(),
    };
  });
}

export async function listRequests(meId: string) {
  const rows = await prisma.friendship.findMany({
    where: {
      status: 'PENDING',
      OR: [{ requesterId: meId }, { addresseeId: meId }],
    },
    orderBy: { createdAt: 'desc' },
    include: { requester: { select: CARD }, addressee: { select: CARD } },
  });
  return rows.map((r) => {
    const incoming = r.addresseeId === meId;
    const u = incoming ? r.requester : r.addressee;
    return {
      id: r.id,
      direction: incoming ? ('incoming' as const) : ('outgoing' as const),
      user: { userId: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username },
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function listBlocked(meId: string) {
  const rows = await prisma.friendship.findMany({
    where: { requesterId: meId, status: 'BLOCKED' },
    orderBy: { updatedAt: 'desc' },
    include: { addressee: { select: CARD } },
  });
  return rows.map((r) => ({
    userId: r.addressee.id,
    username: r.addressee.username,
    since: r.updatedAt.toISOString(),
  }));
}

// ── Contact import ─────────────────────────────────────────────────────

type FriendStatus = 'none' | 'friends' | 'request_sent' | 'request_received' | 'blocked';

function friendStatusFor(meId: string, e: Friendship | null): FriendStatus {
  if (!e) return 'none';
  if (e.status === 'ACCEPTED') return 'friends';
  if (e.status === 'BLOCKED') return 'blocked';
  return e.requesterId === meId ? 'request_sent' : 'request_received';
}

export async function importContacts(meId: string, input: F.ImportContactsBody) {
  const pepper = otpPepper();

  // contact phone (E.164) -> display name from the address book
  const byE164 = new Map<string, string | null>();
  for (const c of input.contacts) {
    const e164 = normalizePhoneNG(c.phone);
    if (e164) byE164.set(e164, c.name ?? null);
  }

  // Candidate plaintext forms to match against User.phone (stored un-normalised).
  const forms = new Set<string>();
  for (const e164 of byE164.keys()) {
    forms.add(e164); // +234…
    forms.add(e164.slice(1)); // 234…
    forms.add('0' + e164.slice(4)); // 0…
  }

  const users = forms.size
    ? await prisma.user.findMany({
        where: { phone: { in: [...forms] }, status: 'ACTIVE', id: { not: meId } },
        select: { ...CARD, phone: true },
      })
    : [];

  // Record the import (hashed — we don't keep non-users' raw numbers).
  await prisma.$transaction(
    [...byE164.entries()].map(([e164, name]) => {
      const phoneHash = hashPhone(e164, pepper)!;
      const matched = users.find((u) => normalizePhoneNG(u.phone ?? '') === e164);
      return prisma.contactImport.upsert({
        where: { userId_phoneHash: { userId: meId, phoneHash } },
        create: { userId: meId, phoneHash, displayName: name, matchedUserId: matched?.id ?? null },
        update: { displayName: name, matchedUserId: matched?.id ?? null },
      });
    }),
  );

  const matches = await Promise.all(
    users.map(async (u) => ({
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      contactName: byE164.get(normalizePhoneNG(u.phone ?? '') ?? '') ?? null,
      friendStatus: friendStatusFor(meId, await edge(meId, u.id)),
    })),
  );

  return { matched: matches.length, contactsProcessed: byE164.size, matches };
}
