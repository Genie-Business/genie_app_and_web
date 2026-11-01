import { normalizeEmail, orderNumber } from '@genie/core';
import { prisma, type Prisma } from '@genie/db';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { notificationEmail, sendMail } from '../../lib/mailer';
import { recordActivity } from '../activities/activities.service';
import { computeGiftCharge, type GiftCharge } from '../fees/fees.service';
import { notify } from '../notifications/notify.service';
import { maybeRewardReferral } from '../referrals/referrals.service';
import { openCheckout } from '../payments/checkout.service';
import { creditBalance, planDiscount, releaseCredits } from '../payments/credits.service';
import { getPaymentProvider } from '../payments/provider';
import { BEING_PAID_MESSAGE, heldByOthers, supersedeOwnCheckouts } from './holds';
import { nextOccurrence } from '../events/recurrence';

/** The gift was taken (or ran out) between the payment starting and arriving. The payment is refunded. */
class ItemUnavailableError extends Error {
  constructor(readonly reason: 'already_gifted' | 'out_of_stock') {
    super(reason);
    this.name = 'ItemUnavailableError';
  }
}

/** A wishlist needs this many items before it can be shared / gifted from. */
const MIN_SHAREABLE_ITEMS = 2;

const ITEM_INCLUDE = {
  product: { include: { inventory: true, merchant: true } },
  wishlist: {
    include: { event: { include: { user: { select: { firstName: true, lastName: true, id: true } } } } },
  },
} satisfies Prisma.WishlistItemInclude;

type ItemFull = Prisma.WishlistItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

async function loadItem(wishlistItemId: string): Promise<ItemFull> {
  const item = await prisma.wishlistItem.findUnique({
    where: { id: wishlistItemId },
    include: ITEM_INCLUDE,
  });
  if (!item) throw notFound('That wishlist item no longer exists.');
  return item;
}

/**
 * Why an item can't be gifted right now, or `null` if it can. Non-throwing so
 * a multi-item checkout can skip a claimed line instead of aborting the batch —
 * on a shared wishlist, items get taken while you shop.
 */
function giftBlockReason(
  item: ItemFull,
  gifterUserId: string | null,
  quantity: number,
): { code: 'unavailable' | 'over_fulfilled' | 'out_of_stock' | 'own_wishlist' | 'event_ended'; message: string } | null {
  if (item.product.status !== 'ACTIVE') {
    return { code: 'unavailable', message: 'That product is no longer available.' };
  }
  if (item.wishlist.event.status === 'DELETED') {
    return { code: 'unavailable', message: 'That wishlist is not available.' };
  }
  if (item.wishlist.event.status === 'EXPIRED') {
    return { code: 'event_ended', message: 'This event has ended.' };
  }
  if (gifterUserId && item.wishlist.event.user.id === gifterUserId) {
    return { code: 'own_wishlist', message: 'You cannot gift an item on your own wishlist.' };
  }
  const remaining = item.quantityWanted - item.quantityFulfilled;
  if (quantity > remaining) {
    return {
      code: 'over_fulfilled',
      message: `Only ${remaining} of this item still need${remaining === 1 ? 's' : ''} a gift.`,
    };
  }
  const stock = item.product.inventory?.availableStock ?? 0;
  if (stock < quantity) {
    return { code: 'out_of_stock', message: 'The merchant is out of stock for this item.' };
  }
  return null;
}

function assertGiftable(item: ItemFull, gifterUserId: string, quantity: number) {
  const blocked = giftBlockReason(item, gifterUserId, quantity);
  if (!blocked) return;
  if (blocked.code === 'over_fulfilled' || blocked.code === 'out_of_stock') {
    throw conflict(blocked.code, blocked.message);
  }
  if (blocked.code === 'unavailable' && item.wishlist.event.status === 'DELETED') {
    throw notFound(blocked.message);
  }
  throw badRequest(blocked.message);
}

export async function quote(wishlistItemId: string, quantity: number, userId?: string) {
  const item = await loadItem(wishlistItemId);
  const charge = await computeGiftCharge({
    unitPriceKobo: item.product.priceKobo,
    quantity,
    deliveryOption: item.product.deliveryOption,
  });
  // Referral credit the buyer would use: all they have, up to what genie keeps on this purchase.
  const discountKobo = userId ? await planDiscount(userId, charge.genieRetainsKobo) : 0n;
  return {
    wishlistItemId,
    productName: item.product.name,
    unitPriceKobo: item.product.priceKobo,
    ...charge,
    availableCreditKobo: userId ? await creditBalance(userId) : 0n,
    discountKobo,
    payKobo: charge.gifterPaysKobo - discountKobo,
  };
}

type PayInput = {
  wishlistItemId: string;
  quantity: number;
  isAnonymous: boolean;
  message?: string;
};

/**
 * Money model for a gift:
 *  - the gifter pays  subtotal + transactionFee + logisticsFee, through Paystack checkout
 *  - genie holds that money and owes the merchant  subtotal − commission
 *    (Order.merchantNetKobo), paid out after delivery (see payouts.service)
 *  - genie revenue = transactionFee + logisticsFee + commission
 *
 * Runs once a payment is confirmed. `idempotencyKey` makes it safe to run twice for
 * the same payment (a webhook and a status check can race): the second attempt
 * collides on the Transaction reference, rolls back, and returns null.
 */
async function finalizeGift(opts: {
  item: ItemFull;
  /** Null for a guest checkout from a shared wishlist link. */
  gifterUserId: string | null;
  /** Shown on the reveal when there is no account (guest). */
  giftedByName?: string | null;
  input: PayInput;
  charge: GiftCharge;
  /** Real PaymentIntent id for the Gift/Transaction FK (1:1). Omit for cart lines. */
  paymentIntentId?: string;
  idempotencyKey: string;
}) {
  const { item, gifterUserId, input, charge } = opts;
  const merchantId = item.product.merchantId;
  const eventId = item.wishlist.event.id;

  // Finished on an earlier attempt (a retry after a partial failure): nothing more to do.
  if (await prisma.transaction.findUnique({ where: { reference: opts.idempotencyKey }, select: { id: true } })) {
    return null;
  }

  // The transaction covers only what must move atomically: the order + gift +
  // transaction records and the fulfilment / stock counters. Notifications and the
  // activity log are written after — a failure there must not roll back a paid gift.
  let created: { gift: { id: string }; order: { id: string; orderNumber: string } };
  try {
    created = await prisma.$transaction(
    async (tx) => {
      // Take the item and its stock first, atomically: if two payments for the same gift ever
      // arrive, exactly one gets it and the other is refunded.
      const taken = await tx.wishlistItem.updateMany({
        where: { id: item.id, quantityFulfilled: { lte: item.quantityWanted - input.quantity } },
        data: { quantityFulfilled: { increment: input.quantity } },
      });
      if (taken.count === 0) throw new ItemUnavailableError('already_gifted');
      if (item.product.inventory) {
        const stock = await tx.inventory.updateMany({
          where: { productId: item.productId, availableStock: { gte: input.quantity } },
          data: { availableStock: { decrement: input.quantity } },
        });
        if (stock.count === 0) throw new ItemUnavailableError('out_of_stock');
      }

      const order = await tx.order.create({
        data: {
          orderNumber: orderNumber(),
          merchantId,
          buyerUserId: gifterUserId,
          eventId,
          status: 'PAID',
          subtotalKobo: charge.subtotalKobo,
          feeKobo: charge.transactionFeeKobo + charge.logisticsFeeKobo,
          commissionKobo: charge.commissionKobo,
          totalKobo: charge.gifterPaysKobo,
          merchantNetKobo: charge.merchantReceivesKobo,
          deliveryAddress: item.wishlist.event.deliveryAddress,
          items: {
            create: {
              productId: item.productId,
              description: item.product.name,
              unitPriceKobo: item.product.priceKobo,
              quantity: input.quantity,
              lineTotalKobo: charge.subtotalKobo,
            },
          },
          delivery: { create: { status: 'PENDING', address: item.wishlist.event.deliveryAddress } },
        },
      });

      const gift = await tx.gift.create({
        data: {
          wishlistItemId: item.id,
          gifterUserId,
          giftedByName: gifterUserId || input.isAnonymous ? null : (opts.giftedByName ?? null),
          isAnonymous: input.isAnonymous,
          amountKobo: charge.subtotalKobo,
          message: input.message,
          status: 'PAID',
          orderId: order.id,
          paymentIntentId: opts.paymentIntentId,
        },
      });

      await tx.transaction.create({
        data: {
          reference: opts.idempotencyKey,
          userId: gifterUserId,
          type: 'GIFT',
          amountKobo: charge.gifterPaysKobo,
          feeKobo: charge.genieRetainsKobo,
          status: 'COMPLETED',
          giftId: gift.id,
          orderId: order.id,
          paymentIntentId: opts.paymentIntentId,
          narration: `Gift for ${item.wishlist.event.user.firstName}: ${item.product.name}`,
        },
      });

      return { gift, order };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      logger.info({ key: opts.idempotencyKey }, 'gift already finalised');
      return null;
    }
    throw err;
  }
  const { gift, order } = created;

  // ── Post-commit side effects (best-effort) ────────────────────────────
  const celebrantId = item.wishlist.event.user.id;
  const gifterName = input.isAnonymous
    ? 'Someone'
    : gifterUserId
      ? ((await prisma.user
          .findUnique({ where: { id: gifterUserId }, select: { firstName: true } })
          .then((u) => u?.firstName)) ?? 'A friend')
      : (opts.giftedByName?.trim().split(/\s+/)[0] ?? 'A friend');

  try {
    await notify({
      userId: celebrantId,
      type: 'gift.received',
      title: input.isAnonymous ? 'A secret gift appeared' : `${gifterName} sent you a gift`,
      body: input.isAnonymous
        ? `An anonymous gift was added to "${item.wishlist.name}". It'll be revealed when it arrives.`
        : `${gifterName} gifted you ${item.product.name}.`,
      payload: { giftId: gift.id, eventId },
    });
    await notify({
      userId: merchantId,
      type: 'order.new',
      title: 'New order',
      body: `${item.product.name} ×${input.quantity} · ${order.orderNumber}`,
      payload: { orderId: order.id },
    });
    if (gifterUserId) {
      await recordActivity({
        userId: gifterUserId,
        category: 'TRANSACTION',
        action: 'gift.paid',
        entityType: 'Gift',
        entityId: gift.id,
        metadata: { amountKobo: charge.gifterPaysKobo.toString(), anonymous: input.isAnonymous },
      });
    }
    await recordActivity({
      userId: celebrantId,
      category: 'TRANSACTION',
      action: 'gift.received',
      entityType: 'Gift',
      entityId: gift.id,
      metadata: { productName: item.product.name },
    });
    // A referred user's first paid gift converts their referral.
    if (gifterUserId) await maybeRewardReferral(gifterUserId);
  } catch (err) {
    logger.error({ err, giftId: gift.id }, 'gift post-commit side effects failed');
  }

  logger.info({ giftId: gift.id, orderId: order.id, merchantId }, 'gift finalised');
  return { gift, order };
}

/**
 * Start paying for a single wishlist gift. Returns a Paystack checkout link; the gift
 * is created when the payment is confirmed (see settleGiftPayment).
 */
export async function payForGift(gifterUserId: string, input: PayInput) {
  const item = await loadItem(input.wishlistItemId);
  assertGiftable(item, gifterUserId, input.quantity);

  // Someone else mid-payment for the last of this gift holds it for a few minutes.
  const heldNow = (await heldByOthers([item.id], { userId: gifterUserId })).get(item.id) ?? 0;
  if (item.quantityWanted - item.quantityFulfilled - heldNow < input.quantity) {
    throw conflict('being_paid', BEING_PAID_MESSAGE);
  }
  await supersedeOwnCheckouts([item.id], { userId: gifterUserId });

  const charge = await computeGiftCharge({
    unitPriceKobo: item.product.priceKobo,
    quantity: input.quantity,
    deliveryOption: item.product.deliveryOption,
  });

  const gifter = await prisma.user.findUniqueOrThrow({ where: { id: gifterUserId } });
  const { reference, checkoutUrl, discountKobo, payKobo } = await openCheckout({
    purpose: 'GIFT',
    email: gifter.email,
    amountKobo: charge.gifterPaysKobo,
    maxDiscountKobo: charge.genieRetainsKobo,
    userId: gifterUserId,
    metadata: {
      wishlistItemId: input.wishlistItemId,
      quantity: input.quantity,
      isAnonymous: input.isAnonymous,
      message: input.message ?? null,
    },
  });

  return { status: 'PENDING' as const, reference, checkoutUrl, charge, discountKobo, payKobo };
}

// ── Cart checkout (E013) — pay for several wishlist gifts at once ─────────

export type CartLine = { wishlistItemId: string; quantity: number; isAnonymous: boolean; message?: string };
export type SkippedLine = { wishlistItemId: string; productName: string; reason: string };

/**
 * Price each line, dropping any that can't be gifted right now (someone else
 * claimed the item, it sold out, the event ended). The dropped lines come back
 * in `skipped` so the caller can tell the buyer and tidy their cart.
 */
async function priceCart(gifterUserId: string, lines: CartLine[]) {
  if (lines.length === 0) throw badRequest('Your cart is empty.');
  const priced = [];
  const skipped: SkippedLine[] = [];
  let totalKobo = 0n;
  let genieKeepsKobo = 0n;
  const held = await heldByOthers(lines.map((l) => l.wishlistItemId), { userId: gifterUserId });
  for (const line of lines) {
    const item = await loadItem(line.wishlistItemId);
    const blocked = giftBlockReason(item, gifterUserId, line.quantity);
    if (blocked) {
      skipped.push({ wishlistItemId: line.wishlistItemId, productName: item.product.name, reason: blocked.message });
      continue;
    }
    if (item.quantityWanted - item.quantityFulfilled - (held.get(line.wishlistItemId) ?? 0) < line.quantity) {
      skipped.push({ wishlistItemId: line.wishlistItemId, productName: item.product.name, reason: BEING_PAID_MESSAGE });
      continue;
    }
    const charge = await computeGiftCharge({
      unitPriceKobo: item.product.priceKobo,
      quantity: line.quantity,
      deliveryOption: item.product.deliveryOption,
    });
    priced.push({ item, line, charge });
    totalKobo += charge.gifterPaysKobo;
    genieKeepsKobo += charge.genieRetainsKobo;
  }
  return { priced, skipped, totalKobo, genieKeepsKobo };
}

export async function payForCart(gifterUserId: string, input: { lines: CartLine[] }) {
  const { priced, skipped, totalKobo, genieKeepsKobo } = await priceCart(gifterUserId, input.lines);

  if (priced.length === 0) {
    return { status: 'NOTHING_GIFTABLE' as const, skipped, totalKobo: 0n };
  }

  const gifter = await prisma.user.findUniqueOrThrow({ where: { id: gifterUserId } });
  await supersedeOwnCheckouts(priced.map((p) => p.line.wishlistItemId), { userId: gifterUserId });
  const { reference, checkoutUrl, discountKobo, payKobo } = await openCheckout({
    purpose: 'GIFT',
    email: gifter.email,
    amountKobo: totalKobo,
    maxDiscountKobo: genieKeepsKobo,
    userId: gifterUserId,
    metadata: {
      kind: 'cart',
      items: priced.map(({ line }) => ({
        wishlistItemId: line.wishlistItemId,
        quantity: line.quantity,
        isAnonymous: line.isAnonymous,
        message: line.message ?? null,
      })),
    },
  });
  return { status: 'PENDING' as const, reference, checkoutUrl, totalKobo, discountKobo, payKobo, skipped };
}

/** An intent that was claimed for settling but never finished (the process died) can be retaken after this. */
const STALE_CLAIM_MS = 2 * 60_000;

/**
 * Called once a GIFT payment is confirmed (webhook or status check). Finalises every
 * gift the payment covers. Idempotent: a repeat, or a concurrent second caller, does
 * nothing, and a half-finished earlier attempt is completed without duplicating gifts.
 */
export async function settleGiftPayment(reference: string, paidAmountKobo: bigint) {
  const intent = await prisma.paymentIntent.findUnique({ where: { reference } });
  if (!intent || intent.purpose !== 'GIFT') return { handled: false as const };
  if (intent.status === 'COMPLETED') return { handled: true as const, duplicate: true };

  // The provider confirmed what was actually paid; it must cover what we asked for.
  if (paidAmountKobo < intent.amountKobo) {
    logger.error(
      { reference, paidAmountKobo: paidAmountKobo.toString(), expectedKobo: intent.amountKobo.toString() },
      'gift payment is less than the amount due: not fulfilling',
    );
    await prisma.paymentIntent.updateMany({
      where: { id: intent.id, status: { not: 'COMPLETED' } },
      data: {
        status: 'FAILED',
        metadata: { ...(intent.metadata as object), failure: 'amount_mismatch', paidAmountKobo: paidAmountKobo.toString() },
      },
    });
    await releaseCredits(prisma, intent.id);
    return { handled: true as const, duplicate: false, mismatch: true };
  }

  // Claim it. Only one caller wins; the rest see someone else is already on it.
  const claimed = await prisma.paymentIntent.updateMany({
    where: {
      id: intent.id,
      OR: [
        { status: { in: ['PENDING', 'EXPIRED'] } },
        { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
      ],
    },
    data: { status: 'PROCESSING' },
  });
  if (claimed.count === 0) return { handled: true as const, duplicate: true };

  const rawMeta = (intent.metadata ?? {}) as Record<string, unknown>;
  try {
    // Cart checkout (in-app) or guest checkout (a shared link, no account): one
    // line per item. A single-item payment is a cart of one.
    const kind = rawMeta.kind;
    const lines: CartLine[] =
      kind === 'cart' || kind === 'guest-cart'
        ? ((rawMeta.items as CartLine[]) ?? [])
        : [
            {
              wishlistItemId: String(rawMeta.wishlistItemId),
              quantity: Number(rawMeta.quantity ?? 1),
              isAnonymous: Boolean(rawMeta.isAnonymous),
              message: (rawMeta.message as string | null) ?? undefined,
            },
          ];
    const guest = kind === 'guest-cart';

    // Lines refunded on an earlier attempt are not tried (or refunded) again.
    const refundedBefore = ((rawMeta.refunds as Array<{ wishlistItemId: string }> | undefined) ?? []).map((r) => r.wishlistItemId);
    const fulfilled: { productName: string }[] = [];
    const refunds: Array<{ wishlistItemId: string; productName: string; amountKobo: string; reason: string; status: string }> = [];
    const priceBeforeDiscount = intent.amountKobo + intent.discountKobo;

    for (const line of lines) {
      if (refundedBefore.includes(line.wishlistItemId)) continue;
      const item = await loadItem(line.wishlistItemId);
      const charge = await computeGiftCharge({
        unitPriceKobo: item.product.priceKobo,
        quantity: line.quantity,
        deliveryOption: item.product.deliveryOption,
      });
      try {
        await finalizeGift({
          item,
          gifterUserId: guest ? null : intent.userId,
          giftedByName: guest ? intent.guestName : null,
          input: {
            wishlistItemId: line.wishlistItemId,
            quantity: line.quantity,
            isAnonymous: line.isAnonymous,
            message: line.message ?? undefined,
          },
          charge,
          // The 1:1 Gift/Transaction link to the intent only makes sense for a single-item payment.
          paymentIntentId: lines.length === 1 ? intent.id : undefined,
          idempotencyKey: `GIFT:${intent.id}:${line.wishlistItemId}`,
        });
        // (finalizeGift returns nothing for a line a previous attempt already finished; it counts too.)
        fulfilled.push({ productName: item.product.name });
      } catch (err) {
        if (!(err instanceof ItemUnavailableError)) throw err;
        // Paid for something that is no longer there: give this line's money back.
        const discountShare = priceBeforeDiscount > 0n ? (intent.discountKobo * charge.gifterPaysKobo) / priceBeforeDiscount : 0n;
        const amountKobo = charge.gifterPaysKobo - discountShare;
        let status = 'REFUNDING';
        try {
          const r = await getPaymentProvider().refundCharge({
            reference: intent.reference,
            amountKobo,
            reason: `${item.product.name} was no longer available`,
          });
          status = r.status;
        } catch (refundErr) {
          status = 'FAILED';
          logger.error({ err: refundErr, reference, wishlistItemId: line.wishlistItemId }, 'refund failed: needs manual attention');
        }
        refunds.push({
          wishlistItemId: line.wishlistItemId,
          productName: item.product.name,
          amountKobo: amountKobo.toString(),
          reason: err.reason,
          status,
        });
      }
    }

    const allRefunded = refunds.length > 0 && fulfilled.length === 0 && refundedBefore.length + refunds.length >= lines.length;
    const refundNotes: Record<string, Prisma.InputJsonValue> = refunds.length
      ? { refunds: [...((rawMeta.refunds as Prisma.InputJsonValue[] | undefined) ?? []), ...refunds] }
      : {};

    // Done: the payment is complete and any referral credit it used is spent, together. A payment
    // whose every gift had to be refunded did not buy anything, so it ends as failed and its credit returns.
    await prisma.$transaction([
      prisma.paymentIntent.update({
        where: { id: intent.id },
        data: allRefunded
          ? { status: 'FAILED', metadata: { ...(rawMeta as Record<string, Prisma.InputJsonValue>), ...refundNotes, failure: 'refunded_unavailable' } }
          : { status: 'COMPLETED', completedAt: new Date(), metadata: { ...(rawMeta as Record<string, Prisma.InputJsonValue>), ...refundNotes } },
      }),
      ...(allRefunded
        ? [prisma.discountCredit.updateMany({ where: { reservedIntentId: intent.id, usedAt: null }, data: { reservedIntentId: null } })]
        : [prisma.discountCredit.updateMany({ where: { reservedIntentId: intent.id, usedAt: null }, data: { usedAt: new Date() } })]),
    ]);

    await tellBuyer(intent, fulfilled, refunds);
    return { handled: true as const, duplicate: false, refunded: refunds.length };
  } catch (err) {
    // Put it back so the next confirmation (or status check) retries; finalised lines are skipped.
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'PROCESSING' }, data: { status: 'PENDING' } });
    throw err;
  }
}

/**
 * Confirm to the buyer, by email and in the app, that their payment was received, and say plainly
 * if any of it is being refunded. A guest has no account, so this email is their only receipt.
 */
async function tellBuyer(
  intent: { userId: string | null; guestEmail: string | null; guestName: string | null; amountKobo: bigint; reference: string },
  fulfilled: { productName: string }[],
  refunds: Array<{ productName: string; amountKobo: string }>,
) {
  const naira = (kobo: bigint) => `₦${(Number(kobo) / 100).toLocaleString()}`;
  const names = fulfilled.map((f) => f.productName).join(', ');
  const refundedKobo = refunds.reduce((sum, r) => sum + BigInt(r.amountKobo), 0n);
  const receipt =
    fulfilled.length > 0
      ? `We received your payment of ${naira(intent.amountKobo)} for ${names}. Reference ${intent.reference}.`
      : `We received your payment, but ${refunds.map((r) => r.productName).join(', ')} was no longer available.`;
  const refundNote =
    refunds.length > 0
      ? ` We are refunding ${naira(refundedKobo)} for ${refunds.map((r) => r.productName).join(', ')}, which someone else gifted first. It can take a few days to reach your account.`
      : '';

  try {
    if (intent.userId) {
      await notify({
        userId: intent.userId,
        type: refunds.length > 0 && fulfilled.length === 0 ? 'payment.refunded' : 'payment.confirmed',
        title: fulfilled.length > 0 ? 'Payment received' : 'Payment refunded',
        body: receipt + refundNote,
        payload: { reference: intent.reference },
      });
    } else if (intent.guestEmail) {
      await sendMail({
        ...notificationEmail({ title: fulfilled.length > 0 ? 'Your gift is confirmed' : 'Your payment is being refunded', body: receipt + refundNote }),
        to: intent.guestEmail,
      });
    }
  } catch (err) {
    logger.error({ err, reference: intent.reference }, 'could not send the payment receipt');
  }
}

// ── Reads ────────────────────────────────────────────────────────────────

// ── Guest checkout (E005) — buy from a shared wishlist link, no account ──

export type GuestCheckoutInput = {
  wishlistItemIds: string[];
  gifterName: string;
  gifterEmail: string;
  gifterPhone?: string;
  isAnonymous: boolean;
  message?: string;
};

/**
 * Price a guest's selection from a shared wishlist: validates the items are on
 * the list and still giftable, then returns the per-item and total cost the
 * gifter will actually pay (item price + transaction fee + delivery). Shared by
 * the quote endpoint (so the web page shows the real number *before* payment)
 * and the checkout itself.
 */
export async function priceGuestSelection(wishlistId: string, wishlistItemIds: string[]) {
  const wishlist = await prisma.wishlist.findUnique({
    where: { id: wishlistId },
    include: {
      event: { select: { status: true } },
      items: { include: { product: { include: { inventory: true } } } },
    },
  });
  if (!wishlist || wishlist.event.status === 'DELETED') {
    throw notFound('This wishlist is not available.');
  }

  const wanted = [...new Set(wishlistItemIds)];
  const items = wishlist.items.filter((i) => wanted.includes(i.id));
  if (items.length === 0) throw badRequest('Choose at least one item to gift.');
  if (items.length !== wanted.length) {
    throw badRequest('Some of those items are not on this wishlist.');
  }

  const breakdown: { wishlistItemId: string; productName: string; amountKobo: bigint }[] = [];
  let totalKobo = 0n;
  for (const it of items) {
    if (it.quantityFulfilled >= it.quantityWanted) {
      throw conflict('already_fulfilled', `"${it.product.name}" has already been gifted.`);
    }
    if (it.product.status !== 'ACTIVE') {
      throw badRequest(`"${it.product.name}" is no longer available.`);
    }
    if (it.product.inventory && it.product.inventory.availableStock < 1) {
      throw conflict('out_of_stock', `"${it.product.name}" is out of stock.`);
    }
    const charge = await computeGiftCharge({
      unitPriceKobo: it.product.priceKobo,
      quantity: 1,
      deliveryOption: it.product.deliveryOption,
    });
    totalKobo += charge.gifterPaysKobo;
    breakdown.push({
      wishlistItemId: it.id,
      productName: it.product.name,
      amountKobo: charge.gifterPaysKobo,
    });
  }
  return { items, breakdown, totalKobo };
}

/** Fee-inclusive total for a guest's selection — no side effects. */
export async function guestQuote(wishlistId: string, wishlistItemIds: string[]) {
  const { breakdown, totalKobo } = await priceGuestSelection(wishlistId, wishlistItemIds);
  return { totalKobo, breakdown };
}

/**
 * A visitor following a shared wishlist link picks one or more items and pays
 * for all of them in one bank transfer. No genie account: the gift rows carry
 * `gifterUserId = null` and (unless anonymous) the guest's name. The webhook
 * finalises everything once the transfer lands.
 */
export async function guestCheckout(wishlistId: string, input: GuestCheckoutInput) {
  const { breakdown, totalKobo } = await priceGuestSelection(wishlistId, input.wishlistItemIds);
  const lines: CartLine[] = breakdown.map((b) => ({
    wishlistItemId: b.wishlistItemId,
    quantity: 1,
    isAnonymous: input.isAnonymous,
    message: input.message,
  }));

  const email = normalizeEmail(input.gifterEmail);
  const heldNow = await heldByOthers(lines.map((l) => l.wishlistItemId), { email });
  for (const b of breakdown) {
    if (heldNow.get(b.wishlistItemId)) {
      throw conflict('being_paid', `"${b.productName}": ${BEING_PAID_MESSAGE}`);
    }
  }
  await supersedeOwnCheckouts(lines.map((l) => l.wishlistItemId), { email });
  const { reference, checkoutUrl } = await openCheckout({
    purpose: 'GIFT',
    email,
    amountKobo: totalKobo,
    userId: null,
    guest: { name: input.gifterName, email, phone: input.gifterPhone },
    metadata: { kind: 'guest-cart', wishlistId, items: lines },
  });

  return { reference, status: 'PENDING' as const, totalKobo, breakdown, checkoutUrl };
}

/** Poll a guest checkout's payment status (unauthenticated, by reference). */
export async function guestPaymentStatus(reference: string) {
  const intent = await prisma.paymentIntent.findUnique({
    where: { reference },
    select: { purpose: true, status: true, amountKobo: true, expiresAt: true, metadata: true },
  });
  const kind = (intent?.metadata as Record<string, unknown> | null)?.kind;
  if (!intent || intent.purpose !== 'GIFT' || kind !== 'guest-cart') {
    throw notFound('Payment not found.');
  }
  return {
    reference,
    status: intent.status,
    totalKobo: intent.amountKobo,
    expiresAt: intent.expiresAt?.toISOString() ?? null,
    // So the page the buyer lands on after paying can offer a way back to the list.
    wishlistId: ((intent.metadata as Record<string, unknown> | null)?.wishlistId as string | undefined) ?? null,
  };
}

export async function listGiven(userId: string) {
  const gifts = await prisma.gift.findMany({
    where: { gifterUserId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      wishlistItem: {
        include: {
          product: { select: { name: true } },
          wishlist: { include: { event: { select: { name: true } } } },
        },
      },
      order: { select: { orderNumber: true, status: true } },
    },
  });
  return gifts.map((g) => ({
    id: g.id,
    productName: g.wishlistItem.product.name,
    eventName: g.wishlistItem.wishlist.event.name,
    amountKobo: g.amountKobo,
    isAnonymous: g.isAnonymous,
    status: g.status,
    revealed: g.revealedAt != null,
    orderNumber: g.order?.orderNumber ?? null,
    orderStatus: g.order?.status ?? null,
    createdAt: g.createdAt.toISOString(),
  }));
}

/**
 * Wishlists belonging to my friends that I can still gift from — the "invites to
 * pay for the items" feed on the home screen. Only ACTIVE events that haven't
 * passed (ANNUAL events roll forward), only shareable wishlists (≥ 2 items), and
 * only ones that still have something unfulfilled.
 */
export async function listInvitations(userId: string) {
  const friendships = await prisma.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  const friendIds = friendships.map((f) =>
    f.requesterId === userId ? f.addresseeId : f.requesterId,
  );
  if (friendIds.length === 0) return [];

  const now = Date.now();
  const wishlists = await prisma.wishlist.findMany({
    where: {
      event: {
        userId: { in: friendIds },
        status: 'ACTIVE',
        OR: [{ expiresAt: { gte: new Date(now) } }, { recurrence: 'ANNUAL' }],
      },
    },
    include: {
      event: {
        select: {
          id: true,
          userId: true,
          name: true,
          type: true,
          eventDate: true,
          expiresAt: true,
          recurrence: true,
          user: { select: { firstName: true, lastName: true, username: true } },
        },
      },
      items: { include: { product: { select: { priceKobo: true } } } },
    },
  });

  const rows = wishlists
    .filter((w) => w.items.length >= MIN_SHAREABLE_ITEMS)
    .map((w) => {
      const outstanding = w.items.filter((i) => i.quantityFulfilled < i.quantityWanted);
      const totalValueKobo = w.items.reduce(
        (s, i) => s + i.product.priceKobo * BigInt(i.quantityWanted),
        0n,
      );
      const outstandingValueKobo = outstanding.reduce(
        (s, i) => s + i.product.priceKobo * BigInt(i.quantityWanted - i.quantityFulfilled),
        0n,
      );
      const occ = nextOccurrence(w.event.eventDate, w.event.expiresAt, w.event.recurrence, now);
      const name = `${w.event.user.firstName} ${w.event.user.lastName}`.trim();
      return {
        wishlistId: w.id,
        wishlistName: w.name,
        celebrantUserId: w.event.userId,
        celebrantName: name || `@${w.event.user.username}`,
        eventName: w.event.name,
        eventType: w.event.type,
        eventDate: occ.eventDate.toISOString(),
        itemCount: w.items.length,
        outstandingCount: outstanding.length,
        totalValueKobo,
        outstandingValueKobo,
      };
    })
    .filter((w) => w.outstandingCount > 0);

  rows.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  return rows;
}

/**
 * An anonymous gift may only be revealed once it has physically reached the
 * celebrant — that is the promise made to the gifter when they choose to send
 * anonymously. "Arrived" means the merchant marked the order delivered, or the
 * item is collected in person (PICKUP has no delivery leg to wait on).
 */
function giftHasArrived(g: { status: string; wishlistItem: { product: { deliveryOption: string } } }): boolean {
  return g.status === 'DELIVERED' || g.wishlistItem.product.deliveryOption === 'PICKUP';
}

export async function listReceived(userId: string) {
  const gifts = await prisma.gift.findMany({
    where: {
      status: { in: ['PAID', 'DELIVERED', 'REVEALED'] },
      wishlistItem: { wishlist: { event: { userId } } },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      gifter: { select: { firstName: true, lastName: true } },
      order: { select: { delivery: { select: { status: true } } } },
      wishlistItem: {
        include: {
          product: { select: { name: true, deliveryOption: true } },
          wishlist: { include: { event: { select: { name: true } } } },
        },
      },
    },
  });
  return gifts.map((g) => {
    const deliveryStatus = g.order?.delivery?.status ?? 'PENDING';
    // Once it has been sent (or for a gift collected in person) the recipient can say it arrived.
    const canConfirmReceived =
      g.status === 'PAID' &&
      (deliveryStatus === 'DISPATCHED' || deliveryStatus === 'IN_TRANSIT' || g.wishlistItem.product.deliveryOption === 'PICKUP');
    const hidden = g.isAnonymous && g.revealedAt == null;
    const gifterName =
      `${g.gifter?.firstName ?? ''} ${g.gifter?.lastName ?? ''}`.trim() ||
      g.giftedByName ||
      'A friend';
    return {
      id: g.id,
      productName: g.wishlistItem.product.name,
      eventName: g.wishlistItem.wishlist.event.name,
      amountKobo: g.amountKobo,
      message: g.message,
      from: hidden ? null : gifterName,
      isAnonymous: g.isAnonymous,
      revealed: g.revealedAt != null,
      canReveal: g.isAnonymous && g.revealedAt == null && giftHasArrived(g),
      status: g.status,
      deliveryStatus,
      canConfirmReceived,
      createdAt: g.createdAt.toISOString(),
    };
  });
}

/** Celebrant reveals an anonymous gift once it physically arrives. */
export async function reveal(userId: string, giftId: string) {
  const gift = await prisma.gift.findUnique({
    where: { id: giftId },
    include: {
      gifter: { select: { firstName: true, lastName: true } },
      wishlistItem: {
        include: {
          product: { select: { deliveryOption: true } },
          wishlist: { include: { event: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!gift) throw notFound('Gift not found.');
  if (gift.wishlistItem.wishlist.event.userId !== userId) {
    throw forbidden('This gift is not on your wishlist.');
  }
  if (!gift.isAnonymous) throw badRequest('This gift is not anonymous.');
  if (gift.revealedAt) throw badRequest('This gift has already been revealed.');
  if (!giftHasArrived(gift)) {
    throw badRequest("You can reveal who this is from once the gift has been delivered.");
  }

  await prisma.gift.update({
    where: { id: giftId },
    data: { revealedAt: new Date(), status: 'REVEALED' },
  });
  await recordActivity({
    userId,
    category: 'APP',
    action: 'gift.revealed',
    entityType: 'Gift',
    entityId: giftId,
  });
  return {
    giftId,
    from:
      `${gift.gifter?.firstName ?? ''} ${gift.gifter?.lastName ?? ''}`.trim() ||
      gift.giftedByName ||
      'A friend',
    message: gift.message,
  };
}
