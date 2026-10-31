import { prisma } from '@genie/db';
import { logger } from '../../lib/logger';
import { settleGiftPayment } from '../gifts/gifts.service';
import { getPaymentProvider } from './provider';

/** Statuses an intent can still move out of. COMPLETED and FAILED are final. */
const OPEN = ['PENDING', 'PROCESSING', 'EXPIRED'] as const;

/**
 * A payment is confirmed: finish whatever it was paying for. Safe to call more
 * than once for the same reference (the webhook and a status check can race).
 */
export async function settlePaidIntent(reference: string, paidAmountKobo: bigint) {
  const intent = await prisma.paymentIntent.findUnique({ where: { reference }, select: { purpose: true } });
  if (!intent) {
    // Not one of ours (another integration on the same Paystack account, say). Acknowledge it
    // rather than fail the webhook, which would only make Paystack retry it for days.
    logger.warn({ reference }, 'confirmed payment for a reference genie does not know');
    return { handled: false as const };
  }
  if (intent.purpose === 'GIFT') return settleGiftPayment(reference, paidAmountKobo);
  logger.warn({ reference, purpose: intent.purpose }, 'confirmed payment for a purpose genie no longer handles');
  return { handled: false as const };
}

/**
 * Bring an intent up to date with what the provider says. The webhook normally
 * does this, but a buyer who lands back on genie before it arrives (or a webhook
 * that never does) must not be left staring at "waiting": status checks call this.
 */
export async function reconcileIntent(reference: string) {
  const intent = await prisma.paymentIntent.findUnique({ where: { reference } });
  if (!intent || !(OPEN as readonly string[]).includes(intent.status)) return intent;

  try {
    const charge = await getPaymentProvider().verifyCharge(reference);
    if (charge.status === 'SUCCESS') {
      await settlePaidIntent(reference, charge.amountKobo);
    } else if (charge.status === 'FAILED') {
      await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: { in: [...OPEN] } }, data: { status: 'FAILED' } });
    } else if (intent.status === 'PENDING' && intent.expiresAt && intent.expiresAt.getTime() < Date.now()) {
      await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    }
  } catch (err) {
    // The provider being unreachable must not turn a status check into an error.
    logger.warn({ err, reference }, 'could not verify payment with the provider');
  }
  return prisma.paymentIntent.findUnique({ where: { reference } });
}
