import { prisma } from '@genie/db';
import { logger } from '../../lib/logger';
import { getPaymentProvider } from './provider';
import { settleAddFunds } from './payments.service';

/**
 * Receive, verify and route a provider webhook. Every event is logged to
 * WebhookEvent for idempotency and audit; handlers are no-ops for events genie
 * doesn't consume yet.
 */
export async function handleProviderWebhook(
  rawBody: string,
  headers: Record<string, string | undefined>,
) {
  const provider = getPaymentProvider();
  const verification = provider.verifyWebhook(rawBody, headers);

  if (!verification.valid) {
    // Don't persist unsigned/forged calls — just log and reject. This also keeps
    // the reject path free of a DB dependency.
    logger.warn({ reason: verification.reason, provider: provider.name }, 'rejected webhook');
    return { accepted: false as const, reason: verification.reason };
  }

  // Idempotency: skip if we've already recorded this external event id.
  if (verification.externalId) {
    const seen = await prisma.webhookEvent.findUnique({
      where: { externalId: verification.externalId },
    });
    if (seen) return { accepted: true as const, duplicate: true };
  }

  const event = await prisma.webhookEvent.create({
    data: {
      provider: provider.name,
      eventType: verification.eventType,
      externalId: verification.externalId,
      payload: verification.payload as object,
      signatureValid: true,
      status: 'RECEIVED',
    },
  });

  try {
    await route(verification.eventType, verification.payload);
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, eventId: event.id }, 'webhook handler failed');
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'FAILED', error: (err as Error).message },
    });
    throw err;
  }

  return { accepted: true as const, duplicate: false };
}

async function route(eventType: string, payload: unknown) {
  const attributes = (payload as { data?: { attributes?: Record<string, unknown> } })?.data
    ?.attributes;

  switch (eventType) {
    case 'payin.received':
    case 'payment.received': {
      const reference = String(attributes?.reference ?? '');
      const amount = BigInt(Math.round(Number(attributes?.amount ?? 0)));
      if (reference) await settleAddFunds(reference, amount);
      return;
    }
    // Events genie will consume in later milestones — acknowledged, not yet acted on.
    case 'transfer.completed':
    case 'transfer.failed':
    case 'nip.transfer.successful':
    case 'nip.transfer.failed':
    case 'account.credit':
    case 'account.debit':
      logger.info({ eventType }, 'webhook acknowledged (no handler yet)');
      return;
    default:
      logger.info({ eventType }, 'unhandled webhook event type');
  }
}
