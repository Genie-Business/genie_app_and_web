import { prisma, type Prisma } from '@genie/db';

/**
 * Referral rewards are money off a later purchase, not cash. A DiscountCredit is spent at
 * checkout: it is *reserved* for the payment that uses it, marked used when that payment is
 * confirmed (see settleGiftPayment, in the same transaction that completes it), and *released*
 * if the payment fails.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** A checkout abandoned this long ago no longer holds on to the credit it reserved. */
const ABANDONED_AFTER_MS = 24 * 3_600_000;

type Holder = { status: string; expiresAt: Date | null };

/** Whether a payment still has a claim on the credits it reserved. */
function stillHolding(intent: Holder): boolean {
  if (intent.status === 'FAILED' || intent.status === 'EXPIRED') return false;
  if (intent.status === 'PENDING' && intent.expiresAt && intent.expiresAt.getTime() < Date.now() - ABANDONED_AFTER_MS) {
    return false;
  }
  return true;
}

/** Credits the user could spend right now: unused, and not tied up in a live checkout. */
async function availableCredits(db: Db, userId: string) {
  const rows = await db.discountCredit.findMany({ where: { userId, usedAt: null }, orderBy: { createdAt: 'asc' } });
  const heldBy = [...new Set(rows.map((r) => r.reservedIntentId).filter((id): id is string => !!id))];
  if (heldBy.length === 0) return rows;

  const intents = await db.paymentIntent.findMany({
    where: { id: { in: heldBy } },
    select: { id: true, status: true, expiresAt: true },
  });
  const live = new Set(intents.filter(stillHolding).map((i) => i.id));
  return rows.filter((r) => !r.reservedIntentId || !live.has(r.reservedIntentId));
}

/** What a user has available to spend, in kobo. */
export async function creditBalance(userId: string): Promise<bigint> {
  return (await availableCredits(prisma, userId)).reduce((sum, c) => sum + c.amountKobo, 0n);
}

/**
 * How much credit a purchase would use: all the user has, up to `capKobo`. The cap is what genie
 * keeps on the purchase (fees plus commission), so the discount comes out of genie's share and
 * the merchant is never paid less.
 */
export async function planDiscount(userId: string, capKobo: bigint): Promise<bigint> {
  if (capKobo <= 0n) return 0n;
  const have = await creditBalance(userId);
  return have < capKobo ? have : capKobo;
}

/**
 * Set aside `amountKobo` of the user's credit for the payment `intentId`, splitting a credit if
 * only part of it is needed. Returns how much was actually reserved: less than asked means the
 * credit changed under us (another checkout took it), and the caller should abandon this one.
 */
export async function reserveCredits(tx: Prisma.TransactionClient, userId: string, amountKobo: bigint, intentId: string) {
  let remaining = amountKobo;
  for (const credit of await availableCredits(tx, userId)) {
    if (remaining <= 0n) break;
    // Compare-and-set: if another checkout changed this credit since we read it, skip it.
    const unchanged = { id: credit.id, usedAt: null, amountKobo: credit.amountKobo, reservedIntentId: credit.reservedIntentId };
    if (credit.amountKobo <= remaining) {
      const took = await tx.discountCredit.updateMany({ where: unchanged, data: { reservedIntentId: intentId } });
      if (took.count === 1) remaining -= credit.amountKobo;
    } else {
      const trimmed = await tx.discountCredit.updateMany({ where: unchanged, data: { amountKobo: credit.amountKobo - remaining } });
      if (trimmed.count === 1) {
        await tx.discountCredit.create({
          data: { userId, amountKobo: remaining, source: credit.source, reservedIntentId: intentId },
        });
        remaining = 0n;
      }
    }
  }
  return amountKobo - remaining;
}

/** The payment will not happen: give the credit back. */
export async function releaseCredits(db: Db, intentId: string) {
  await db.discountCredit.updateMany({
    where: { reservedIntentId: intentId, usedAt: null },
    data: { reservedIntentId: null },
  });
}
