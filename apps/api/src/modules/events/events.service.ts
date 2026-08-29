import { prisma, type Prisma } from '@genie/db';
import type { events as E } from '@genie/contracts';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';

type CreateEvent = E.CreateEventBody;
type UpdateEvent = E.UpdateEventBody;

const EVENT_INCLUDE = {
  wishlists: {
    orderBy: { createdAt: 'asc' },
    include: { items: { select: { quantityWanted: true, quantityFulfilled: true } } },
  },
} satisfies Prisma.EventInclude;

type EventWithProgress = Prisma.EventGetPayload<{ include: typeof EVENT_INCLUDE }>;

function summarize(e: EventWithProgress) {
  const items = e.wishlists.flatMap((w) => w.items);
  const wanted = items.reduce((s, i) => s + i.quantityWanted, 0);
  const filled = items.reduce((s, i) => s + Math.min(i.quantityFulfilled, i.quantityWanted), 0);
  return {
    id: e.id,
    type: e.type,
    name: e.name,
    deliveryAddress: e.deliveryAddress,
    eventDate: e.eventDate.toISOString(),
    expiresAt: e.expiresAt.toISOString(),
    status: e.status,
    wishlistCount: e.wishlists.length,
    itemCount: items.length,
    fulfilmentPct: wanted === 0 ? 0 : Math.round((filled / wanted) * 100),
    createdAt: e.createdAt.toISOString(),
    wishlists: e.wishlists.map((w) => ({
      id: w.id,
      name: w.name,
      itemCount: w.items.length,
    })),
  };
}

async function assertNameFree(userId: string, name: string, exceptId?: string) {
  const clash = await prisma.event.findFirst({
    where: {
      userId,
      name: { equals: name, mode: 'insensitive' },
      status: { not: 'DELETED' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw conflict('event_name_taken', 'You already have an event with this name.');
}

function resolveDates(eventDateIso: string, expiresAtIso?: string) {
  const now = Date.now();
  const eventDate = new Date(eventDateIso);
  if (eventDate.getTime() <= now) throw badRequest('The event date must be in the future.');
  const expiresAt = expiresAtIso ? new Date(expiresAtIso) : eventDate;
  if (expiresAt.getTime() <= now) throw badRequest('The expiry date must be in the future.');
  if (expiresAt.getTime() > eventDate.getTime()) {
    throw badRequest('The expiry date must be on or before the event date.');
  }
  return { eventDate, expiresAt };
}

export async function createEvent(userId: string, input: CreateEvent) {
  await assertNameFree(userId, input.name);
  const { eventDate, expiresAt } = resolveDates(input.eventDate, input.expiresAt);

  const event = await prisma.event.create({
    data: {
      userId,
      type: input.type,
      name: input.name,
      deliveryAddress: input.deliveryAddress,
      eventDate,
      expiresAt,
      ...(input.wishlistName
        ? { wishlists: { create: { name: input.wishlistName } } }
        : {}),
    },
    include: EVENT_INCLUDE,
  });
  await prisma.activityLog.create({
    data: { userId, category: 'EVENT', action: 'event.created', entityType: 'Event', entityId: event.id },
  });
  logger.info({ userId, eventId: event.id }, 'event created');
  return summarize(event);
}

export async function listEvents(userId: string) {
  const events = await prisma.event.findMany({
    where: { userId, status: { not: 'DELETED' } },
    include: EVENT_INCLUDE,
    orderBy: { eventDate: 'asc' },
  });
  return events.map(summarize);
}

export async function dashboard(userId: string) {
  const events = await prisma.event.findMany({
    where: { userId, status: { not: 'DELETED' } },
    include: EVENT_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  const summaries = events.map(summarize);
  return {
    totalEvents: summaries.length,
    activeEvents: summaries.filter((s) => s.status === 'ACTIVE').length,
    recentEvents: summaries.slice(0, 5),
  };
}

export async function getEvent(userId: string, id: string) {
  const event = await prisma.event.findFirst({
    where: { id, userId, status: { not: 'DELETED' } },
    include: EVENT_INCLUDE,
  });
  if (!event) throw notFound('Event not found.');
  return summarize(event);
}

export async function updateEvent(userId: string, id: string, input: UpdateEvent) {
  const existing = await prisma.event.findFirst({
    where: { id, userId, status: { not: 'DELETED' } },
  });
  if (!existing) throw notFound('Event not found.');
  if (input.name && input.name !== existing.name) await assertNameFree(userId, input.name, id);

  const targetEventDate = input.eventDate ?? existing.eventDate.toISOString();
  const targetExpiresAt = input.expiresAt ?? existing.expiresAt.toISOString();
  const { eventDate, expiresAt } =
    input.eventDate || input.expiresAt
      ? resolveDates(targetEventDate, targetExpiresAt)
      : { eventDate: existing.eventDate, expiresAt: existing.expiresAt };

  const event = await prisma.event.update({
    where: { id },
    data: {
      type: input.type,
      name: input.name,
      deliveryAddress: input.deliveryAddress === undefined ? undefined : input.deliveryAddress,
      eventDate,
      expiresAt,
    },
    include: EVENT_INCLUDE,
  });
  return summarize(event);
}

export async function deleteEvent(userId: string, id: string) {
  const existing = await prisma.event.findFirst({
    where: { id, userId, status: { not: 'DELETED' } },
    select: { id: true },
  });
  if (!existing) throw notFound('Event not found.');
  // Soft delete — the event drops off the user's list but stays in history
  // (orders, gifts and transactions against it are preserved).
  await prisma.event.update({ where: { id }, data: { status: 'DELETED' } });
  await prisma.activityLog.create({
    data: { userId, category: 'EVENT', action: 'event.deleted', entityType: 'Event', entityId: id },
  });
}
