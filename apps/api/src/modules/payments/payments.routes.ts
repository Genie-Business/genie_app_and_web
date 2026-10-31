import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../../lib/router';
import { gifts as G } from '@genie/contracts';
import { prisma } from '@genie/db';
import { badRequest, notFound } from '../../lib/errors';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { requireAuth } from '../../middleware/auth';
import { getEnv } from '../../env';
import { getPaymentProvider, MockPaymentProvider } from './provider';
import { reconcileIntent } from './reconcile.service';
import { handleProviderWebhook } from './webhook.service';
import { addCard, listCards, removeCard } from './cards.service';

const router = createRouter();

const dataObj = z.object({ data: z.record(z.unknown()) });

// Auth gates (route-level middleware in createRoute breaks @hono/zod-openapi
// context inference, so apply them here instead).
router.use('/intents/*', requireAuth);
router.use('/cards', requireAuth);
router.use('/cards/*', requireAuth);

// ── GET /payments/intents/{reference} ───────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/intents/{reference}',
    tags: ['Payments'],
    summary: 'Check on a payment',
    description:
      'Asks the payment provider about the payment if it is still open, so the answer is current even if its webhook has not arrived yet.',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ reference: z.string() }) },
    responses: {
      200: jsonResponse('Payment', dataObj),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const user = c.get('user')!;
    const { reference } = c.req.valid('param');
    const intent = await reconcileIntent(reference);
    if (!intent || intent.userId !== user.id) throw notFound('Payment not found.');
    return c.json(
      {
        data: {
          reference: intent.reference,
          purpose: intent.purpose,
          amountKobo: intent.amountKobo.toString(),
          discountKobo: intent.discountKobo.toString(),
          status: intent.status,
          checkoutUrl: intent.checkoutUrl,
          expiresAt: intent.expiresAt?.toISOString() ?? null,
        },
      },
      200,
    );
  },
);

// ── POST /payments/_mock/pay  (mock provider, never in production) ──────
router.openapi(
  createRoute({
    method: 'post',
    path: '/_mock/pay',
    tags: ['Payments'],
    summary: 'DEV ONLY: pretend the buyer finished checkout for a payment',
    description:
      'Only available with PAYMENTS_PROVIDER=mock outside production. Drives the same path as a real `charge.success` webhook so gifting can be tested end to end without Paystack.',
    request: { body: jsonBody(z.object({ reference: z.string(), amountKobo: z.number().int().positive().optional() })) },
    responses: {
      200: jsonResponse('Payment applied', dataObj),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const provider = getPaymentProvider();
    if (!(provider instanceof MockPaymentProvider) || getEnv().APP_ENV === 'production') {
      throw badRequest('Mock payments are only available with PAYMENTS_PROVIDER=mock outside production.');
    }
    const { reference, amountKobo } = c.req.valid('json');
    const known = await prisma.paymentIntent.findUnique({ where: { reference }, select: { id: true } });
    if (!known) throw notFound('Payment not found.');
    const { body, signature } = provider.buildChargeSuccessEvent(reference, amountKobo ? BigInt(amountKobo) : undefined);
    const result = await handleProviderWebhook(body, { 'x-paystack-signature': signature });
    if (!result.accepted) throw badRequest(`Mock payment rejected: ${result.reason}`);
    return c.json({ data: result }, 200);
  },
);

// ── POST /payments/webhooks/paystack ───────────────────────────────────
// Paystack signs the exact bytes it sends, so the body is read raw and verified
// before it is parsed.
router.post('/webhooks/paystack', async (c) => {
  const raw = await c.req.text();
  const headers: Record<string, string | undefined> = {
    'x-paystack-signature': c.req.header('x-paystack-signature'),
  };
  const result = await handleProviderWebhook(raw, headers);
  // Always answer quickly so the provider doesn't retry a duplicate; failures are
  // recorded in WebhookEvent for replay.
  return c.json({ received: true, ...result }, result.accepted ? 200 : 202);
});

// ── Cards (E012, US0019) ──────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/cards',
    tags: ['Payments'],
    summary: 'List my saved cards',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Cards', z.object({ data: z.array(z.record(z.unknown())) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json({ data: await listCards(c.get('user')!.id) }, 200),
);
router.openapi(
  createRoute({
    method: 'post',
    path: '/cards',
    tags: ['Payments'],
    summary: 'Add a (provider-tokenised) card',
    description: 'The card is tokenised by the payment provider on the client. genie never receives the PAN, CVV or PIN.',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(G.addCardBody) },
    responses: { 201: jsonResponse('Card added', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await addCard(c.get('user')!.id, c.req.valid('json')) }, 201),
);
router.openapi(
  createRoute({
    method: 'delete',
    path: '/cards/{id}',
    tags: ['Payments'],
    summary: 'Remove a card (permanent)',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: jsonResponse('Removed', z.object({ data: z.object({ message: z.string() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    await removeCard(c.get('user')!.id, c.req.valid('param').id);
    return c.json({ data: { message: 'Card removed.' } }, 200);
  },
);

// Register the webhook route in the OpenAPI doc without zod validation.
// Path is relative to this router's mount point (/v1/payments).
router.openAPIRegistry.registerPath({
  method: 'post',
  path: '/webhooks/paystack',
  tags: ['Payments'],
  summary: 'Paystack webhook receiver (signature-verified)',
  request: { body: { content: { 'application/json': { schema: z.object({ event: z.string(), data: z.record(z.unknown()) }) } } } },
  responses: { 200: { description: 'Event accepted' }, 202: { description: 'Event rejected but recorded' } },
});

export default router;
