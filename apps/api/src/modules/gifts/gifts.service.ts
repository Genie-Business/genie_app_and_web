import { orderNumber, paymentReference, transactionReference } from '@genie/core';
import { prisma, type Prisma } from '@genie/db';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { recordActivity } from '../activities/activities.service';
import { computeGiftCharge, type GiftCharge } from '../fees/fees.service';
import { notify } from '../notifications/notify.service';
import { maybeRewardReferral } from '../referrals/referrals.service';
import { getBalanceKobo, postEntry } from '../payments/ledger.service';
import { getPaymentProvider } from '../payments/provider';
import { ensureWallet } from '../payments/wallet.service';

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

function assertGiftable(item: ItemFull, gifterUserId: string, quantity: number) {
  if (item.product.status !== 'ACTIVE') throw badRequest('That product is no longer available.');
  if (item.wishlist.event.status === 'DELETED') throw notFound('That wishlist is not available.');
  if (item.wishlist.event.status === 'EXPIRED') throw badRequest('This event has ended.');
  if (item.wishlist.event.user.id === gifterUserId) {
    throw badRequest('You cannot gift an item on your own wishlist.');
  }
  const remaining = item.quantityWanted - item.quantityFulfilled;
  if (quantity > remaining) {
    throw conflict('over_fulfilled', `Only ${remaining} of this item still need${remaining === 1 ? 's' : ''} a gift.`);
  }
  const stock = item.product.inventory?.availableStock ?? 0;
  if (stock < quantity) throw conflict('out_of_stock', 'The merchant is out of stock for this item.');
}

export async function quote(wishlistItemId: string, quantity: number) {
  const item = await loadItem(wishlistItemId);
  const charge = await computeGiftCharge({
    unitPriceKobo: item.product.priceKobo,
    quantity,
    deliveryOption: item.product.deliveryOption,
  });
  return {
    wishlistItemId,
    productName: item.product.name,
    unitPriceKobo: item.product.priceKobo,
    ...charge,
  };
}

type PayInput = {
  wishlistItemId: string;
  quantity: number;
  isAnonymous: boolean;
  message?: string;
  method: 'WALLET' | 'BANK_TRANSFER';
};

/**
 * Money model for a gift:
 *  - gifter pays  subtotal + transactionFee + logisticsFee
 *  - merchant wallet is credited  subtotal − commission  (settled to bank later)
 *  - genie revenue = transactionFee + logisticsFee + commission  (tracked on the
 *    Order/Transaction, not a user wallet — a separate GL account)
 */
async function finalizeGift(opts: {
  item: ItemFull;
  gifterUserId: string;
  input: PayInput;
  charge: GiftCharge;
  paidFromWallet: boolean;
  paymentIntentId?: string;
}) {
  const { item, gifterUserId, input, charge } = opts;
  const merchantId = item.product.merchantId;
  const eventId = item.wishlist.event.id;

  // Provision wallets outside the transaction (provider calls + idempotent).
  await ensureWallet(merchantId);
  if (opts.paidFromWallet) await ensureWallet(gifterUserId);

  // The transaction covers only what must move atomically: the two ledger
  // postings, the order + gift + transaction records, and the fulfilment /
  // stock counters. Notifications and the activity log are written after — a
  // failure there must not roll back a paid gift.
  const { gift, order } = await prisma.$transaction(
    async (tx) => {
      if (opts.paidFromWallet) {
        await postEntry(
          {
            userId: gifterUserId,
            direction: 'DEBIT',
            amountKobo: charge.gifterPaysKobo,
            reason: 'GIFT_SENT',
            refType: 'WishlistItem',
            refId: item.id,
            narration: `Gift: ${item.product.name}`,
            idempotencyKey: opts.paymentIntentId
              ? `gift-debit:${opts.paymentIntentId}`
              : `gift-debit:${gifterUserId}:${item.id}:${Date.now()}`,
          },
          tx,
        );
      }

      await postEntry(
        {
          userId: merchantId,
          direction: 'CREDIT',
          amountKobo: charge.merchantReceivesKobo,
          reason: 'GIFT_RECEIVED',
          refType: 'WishlistItem',
          refId: item.id,
          narration: `Sale: ${item.product.name} ×${input.quantity}`,
          idempotencyKey: opts.paymentIntentId
            ? `gift-credit:${opts.paymentIntentId}`
            : `gift-credit:${merchantId}:${item.id}:${Date.now()}`,
        },
        tx,
      );

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
          reference: transactionReference(),
          userId: gifterUserId,
          type: 'GIFT',
          amountKobo: charge.gifterPaysKobo,
          feeKobo: charge.genieRetainsKobo,
          status: 'COMPLETED',
          giftId: gift.id,
          orderId: order.id,
          paymentIntentId: opts.paymentIntentId,
          narration: `Gift for ${item.wishlist.event.user.firstName} — ${item.product.name}`,
        },
      });

      await tx.wishlistItem.update({
        where: { id: item.id },
        data: { quantityFulfilled: { increment: input.quantity } },
      });
      await tx.inventory.updateMany({
        where: { productId: item.productId },
        data: { availableStock: { decrement: input.quantity } },
      });

      return { gift, order };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  // ── Post-commit side effects (best-effort) ────────────────────────────
  const celebrantId = item.wishlist.event.user.id;
  const gifterName = input.isAnonymous
    ? 'Someone'
    : (await prisma.user
        .findUnique({ where: { id: gifterUserId }, select: { firstName: true } })
        .then((u) => u?.firstName)) ?? 'A friend';

  try {
    await notify({
      userId: celebrantId,
      type: 'gift.received',
      title: input.isAnonymous ? 'A secret gift appeared 🎁' : `${gifterName} sent you a gift 🎁`,
      body: input.isAnonymous
        ? `An anonymous gift was added to "${item.wishlist.name}". It'll be revealed when it arrives.`
        : `${gifterName} gifted you ${item.product.name}.`,
      payload: { giftId: gift.id, eventId },
    });
    await notify({
      userId: merchantId,
      type: 'order.new',
      title: 'New order',
      body: `${item.product.name} ×${input.quantity} — ${order.orderNumber}`,
      payload: { orderId: order.id },
    });
    await recordActivity({
      userId: gifterUserId,
      category: 'TRANSACTION',
      action: 'gift.paid',
      entityType: 'Gift',
      entityId: gift.id,
      metadata: { amountKobo: charge.gifterPaysKobo.toString(), anonymous: input.isAnonymous },
    });
    await recordActivity({
      userId: celebrantId,
      category: 'TRANSACTION',
      action: 'gift.received',
      entityType: 'Gift',
      entityId: gift.id,
      metadata: { productName: item.product.name },
    });
    // A referred user's first paid gift converts their referral.
    await maybeRewardReferral(gifterUserId);
  } catch (err) {
    logger.error({ err, giftId: gift.id }, 'gift post-commit side effects failed');
  }

  logger.info({ giftId: gift.id, orderId: order.id, merchantId }, 'gift finalised');
  return { gift, order };
}

export async function payForGift(gifterUserId: string, input: PayInput) {
  const item = await loadItem(input.wishlistItemId);
  assertGiftable(item, gifterUserId, input.quantity);

  const charge = await computeGiftCharge({
    unitPriceKobo: item.product.priceKobo,
    quantity: input.quantity,
    deliveryOption: item.product.deliveryOption,
  });

  if (input.method === 'WALLET') {
    await ensureWallet(gifterUserId);
    const balance = await getBalanceKobo(gifterUserId);
    if (balance < charge.gifterPaysKobo) {
      throw conflict(
        'insufficient_funds',
        `You need ₦${(Number(charge.gifterPaysKobo) / 100).toLocaleString()} but your wallet has ₦${(Number(balance) / 100).toLocaleString()}. Add funds first.`,
      );
    }
    const { gift, order } = await finalizeGift({ item, gifterUserId, input, charge, paidFromWallet: true });
    return {
      status: 'PAID' as const,
      giftId: gift.id,
      orderNumber: order.orderNumber,
      charge,
    };
  }

  // BANK_TRANSFER — issue a one-off virtual account; the webhook finalises it.
  const provider = getPaymentProvider();
  const reference = paymentReference();
  const gifter = await prisma.user.findUniqueOrThrow({ where: { id: gifterUserId } });
  const dva = await provider.createDynamicVirtualAccount({
    amountKobo: charge.gifterPaysKobo,
    reference,
    customerName: `${gifter.firstName} ${gifter.lastName}`.trim(),
    ttlSeconds: 1800,
  });
  const intent = await prisma.paymentIntent.create({
    data: {
      reference,
      userId: gifterUserId,
      purpose: 'GIFT',
      amountKobo: charge.gifterPaysKobo,
      provider: provider.name,
      method: 'BANK_TRANSFER',
      status: 'PENDING',
      dynamicVirtualNuban: {
        accountNumber: dva.accountNumber,
        bankName: dva.bankName,
        accountName: dva.accountName,
      },
      expiresAt: dva.expiresAt ? new Date(dva.expiresAt) : null,
      metadata: {
        wishlistItemId: input.wishlistItemId,
        quantity: input.quantity,
        isAnonymous: input.isAnonymous,
        message: input.message ?? null,
      },
    },
  });

  return {
    status: 'PENDING' as const,
    reference: intent.reference,
    virtualAccount: { ...dva },
    charge,
  };
}

/** Called by the payment webhook when a GIFT-purpose transfer lands. */
export async function settleGiftTransfer(reference: string, paidAmountKobo: bigint) {
  const intent = await prisma.paymentIntent.findUnique({ where: { reference } });
  if (!intent || intent.purpose !== 'GIFT') return { handled: false };
  if (intent.status === 'COMPLETED') return { handled: true, duplicate: true };

  const meta = intent.metadata as {
    wishlistItemId: string;
    quantity: number;
    isAnonymous: boolean;
    message: string | null;
  };
  const item = await loadItem(meta.wishlistItemId);
  const charge = await computeGiftCharge({
    unitPriceKobo: item.product.priceKobo,
    quantity: meta.quantity,
    deliveryOption: item.product.deliveryOption,
  });
  if (paidAmountKobo > 0n && paidAmountKobo < charge.gifterPaysKobo) {
    logger.warn({ reference, paidAmountKobo: paidAmountKobo.toString() }, 'gift underpaid');
  }

  await finalizeGift({
    item,
    gifterUserId: intent.userId,
    input: {
      wishlistItemId: meta.wishlistItemId,
      quantity: meta.quantity,
      isAnonymous: meta.isAnonymous,
      message: meta.message ?? undefined,
      method: 'BANK_TRANSFER',
    },
    charge,
    paidFromWallet: false,
    paymentIntentId: intent.id,
  });
  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  return { handled: true, duplicate: false };
}

// ── Reads ────────────────────────────────────────────────────────────────

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

export async function listReceived(userId: string) {
  const gifts = await prisma.gift.findMany({
    where: {
      status: { in: ['PAID', 'DELIVERED', 'REVEALED'] },
      wishlistItem: { wishlist: { event: { userId } } },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      gifter: { select: { firstName: true, lastName: true } },
      wishlistItem: {
        include: {
          product: { select: { name: true } },
          wishlist: { include: { event: { select: { name: true } } } },
        },
      },
    },
  });
  return gifts.map((g) => {
    const hidden = g.isAnonymous && g.revealedAt == null;
    return {
      id: g.id,
      productName: g.wishlistItem.product.name,
      eventName: g.wishlistItem.wishlist.event.name,
      amountKobo: g.amountKobo,
      message: g.message,
      from: hidden ? null : `${g.gifter?.firstName ?? ''} ${g.gifter?.lastName ?? ''}`.trim() || 'A friend',
      isAnonymous: g.isAnonymous,
      revealed: g.revealedAt != null,
      canReveal: g.isAnonymous && g.revealedAt == null,
      status: g.status,
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
      wishlistItem: { include: { wishlist: { include: { event: { select: { userId: true } } } } } },
    },
  });
  if (!gift) throw notFound('Gift not found.');
  if (gift.wishlistItem.wishlist.event.userId !== userId) {
    throw forbidden('This gift is not on your wishlist.');
  }
  if (!gift.isAnonymous) throw badRequest('This gift is not anonymous.');
  if (gift.revealedAt) throw badRequest('This gift has already been revealed.');

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
    from: `${gift.gifter?.firstName ?? ''} ${gift.gifter?.lastName ?? ''}`.trim() || 'A friend',
    message: gift.message,
  };
}
