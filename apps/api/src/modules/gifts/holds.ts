import { normalizeEmail } from '@genie/core';
import { prisma } from '@genie/db';
import { releaseCredits } from '../payments/credits.service';

/**
 * A gift someone has started paying for stays off the shelf for everyone else for this long, so
 * two people (or one person twice) can't both be charged for the same thing. The hold lapses on
 * its own: an abandoned checkout frees the gift again.
 */
export const HOLD_MS = 20 * 60_000;

/** Who is asking: a signed-in buyer, or a guest identified by email. */
export type Buyer = { userId?: string | null; email?: string | null };

type Line = { wishlistItemId: string; quantity: number };

/** The items and quantities a payment intent is paying for, read from its stored metadata. */
export function linesOf(metadata: unknown): Line[] {
  const m = (metadata ?? {}) as Record<string, unknown>;
  const items = m.items;
  if (Array.isArray(items)) {
    return items.map((i) => ({ wishlistItemId: String((i as Line).wishlistItemId), quantity: Number((i as Line).quantity ?? 1) }));
  }
  if (typeof m.wishlistItemId === 'string') return [{ wishlistItemId: m.wishlistItemId, quantity: Number(m.quantity ?? 1) }];
  return [];
}

type Open = { id: string; userId: string | null; guestEmail: string | null; metadata: unknown };

async function openCheckouts(): Promise<Open[]> {
  return prisma.paymentIntent.findMany({
    where: { purpose: 'GIFT', status: 'PENDING', createdAt: { gt: new Date(Date.now() - HOLD_MS) } },
    select: { id: true, userId: true, guestEmail: true, metadata: true },
  });
}

const isMine = (intent: Open, me: Buyer) =>
  (!!me.userId && intent.userId === me.userId) ||
  (!!me.email && !!intent.guestEmail && normalizeEmail(intent.guestEmail) === normalizeEmail(me.email));

/** For each item, how many are being paid for right now by *other* buyers. */
export async function heldByOthers(itemIds: string[], me: Buyer): Promise<Map<string, number>> {
  const held = new Map<string, number>();
  if (itemIds.length === 0) return held;
  for (const intent of await openCheckouts()) {
    if (isMine(intent, me)) continue;
    for (const line of linesOf(intent.metadata)) {
      if (itemIds.includes(line.wishlistItemId)) {
        held.set(line.wishlistItemId, (held.get(line.wishlistItemId) ?? 0) + line.quantity);
      }
    }
  }
  return held;
}

/**
 * The buyer starts a fresh checkout for these items: any earlier unpaid checkout of their own for
 * them is retired, so retrying never leaves two live payment links behind for the same gift.
 */
export async function supersedeOwnCheckouts(itemIds: string[], me: Buyer): Promise<void> {
  if (itemIds.length === 0) return;
  for (const intent of await openCheckouts()) {
    if (!isMine(intent, me)) continue;
    if (!linesOf(intent.metadata).some((l) => itemIds.includes(l.wishlistItemId))) continue;
    const retired = await prisma.paymentIntent.updateMany({
      where: { id: intent.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    if (retired.count > 0) await releaseCredits(prisma, intent.id);
  }
}

/** The message shown when a gift is being paid for by someone else right now. */
export const BEING_PAID_MESSAGE =
  'Someone else is paying for this gift right now. If they don’t finish, it will be available again in a few minutes.';
