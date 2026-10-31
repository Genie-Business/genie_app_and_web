import { paymentReference } from '@genie/core';
import { prisma, type Prisma } from '@genie/db';
import { getEnv } from '../../env';
import { getPaymentProvider } from './provider';

/** How long a checkout link is treated as live before an unpaid intent is marked expired. */
export const CHECKOUT_TTL_MS = 60 * 60_000;

export type CheckoutRequest = {
  purpose: 'GIFT';
  /** Paystack needs an email on every charge: the buyer's account email, or the guest's. */
  email: string;
  /** What the buyer is actually charged, after any discount. */
  amountKobo: bigint;
  discountKobo?: bigint;
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

  const charge = await provider.initializeCharge({
    email: req.email,
    amountKobo: req.amountKobo,
    reference,
    callbackUrl,
    metadata: { intent: reference, purpose: req.purpose },
  });

  const intent = await prisma.paymentIntent.create({
    data: {
      reference,
      userId: req.userId,
      guestName: req.guest?.name,
      guestEmail: req.guest?.email,
      guestPhone: req.guest?.phone,
      purpose: req.purpose,
      amountKobo: req.amountKobo,
      discountKobo: req.discountKobo ?? 0n,
      provider: provider.name,
      providerRef: charge.accessCode,
      method: 'CARD',
      status: 'PENDING',
      checkoutUrl: charge.checkoutUrl,
      expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
      metadata: req.metadata as Prisma.InputJsonValue,
    },
  });

  return { intent, reference, checkoutUrl: charge.checkoutUrl };
}
