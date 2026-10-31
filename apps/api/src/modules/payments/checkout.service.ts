import { paymentReference } from '@genie/core';
import { prisma, type Prisma } from '@genie/db';
import { getEnv } from '../../env';
import { conflict } from '../../lib/errors';
import { planDiscount, reserveCredits } from './credits.service';
import { getPaymentProvider } from './provider';

/** How long a checkout link is treated as live before an unpaid intent is marked expired. */
export const CHECKOUT_TTL_MS = 60 * 60_000;

export type CheckoutRequest = {
  purpose: 'GIFT';
  /** Paystack needs an email on every charge: the buyer's account email, or the guest's. */
  email: string;
  /** The full price. What the buyer is charged is this less any referral credit applied. */
  amountKobo: bigint;
  /**
   * The most referral credit this purchase may use: what genie keeps on it (fees plus commission),
   * so the merchant's share is never touched. Leave out for guests, who have no credit.
   */
  maxDiscountKobo?: bigint;
  userId: string | null;
  guest?: { name: string; email: string; phone?: string };
  /** What `settle*` needs to finish the job once the payment is confirmed. */
  metadata: Record<string, unknown>;
};

/**
 * Start a hosted-checkout payment: ask the provider for a checkout page, record a
 * PENDING PaymentIntent, and hand back the link. Nothing is fulfilled here; that
 * happens when the payment is confirmed (webhook, or a status check that verifies it).
 */
export async function openCheckout(req: CheckoutRequest) {
  const provider = getPaymentProvider();
  const reference = paymentReference();
  const callbackUrl = `${getEnv().APP_PUBLIC_URL}/pay/done?reference=${encodeURIComponent(reference)}`;

  const discountKobo = req.userId && req.maxDiscountKobo ? await planDiscount(req.userId, req.maxDiscountKobo) : 0n;
  const chargedKobo = req.amountKobo - discountKobo;

  const charge = await provider.initializeCharge({
    email: req.email,
    amountKobo: chargedKobo,
    reference,
    callbackUrl,
    metadata: { intent: reference, purpose: req.purpose },
  });

  const intent = await prisma.$transaction(async (tx) => {
    const created = await tx.paymentIntent.create({
      data: {
        reference,
        userId: req.userId,
        guestName: req.guest?.name,
        guestEmail: req.guest?.email,
        guestPhone: req.guest?.phone,
        purpose: req.purpose,
        amountKobo: chargedKobo,
        discountKobo,
        provider: provider.name,
        providerRef: charge.accessCode,
        method: 'CARD',
        status: 'PENDING',
        checkoutUrl: charge.checkoutUrl,
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
        metadata: req.metadata as Prisma.InputJsonValue,
      },
    });
    if (discountKobo > 0n && req.userId) {
      const reserved = await reserveCredits(tx, req.userId, discountKobo, created.id);
      // Another checkout spent the credit between pricing this one and reserving it: start over.
      if (reserved < discountKobo) throw conflict('credit_changed', 'Your referral credit just changed. Please try again.');
    }
    return created;
  });

  return { intent, reference, checkoutUrl: charge.checkoutUrl, discountKobo, payKobo: chargedKobo };
}
