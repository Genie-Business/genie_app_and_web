import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../../lib/router';
import { payments as P, gifts as G } from '@genie/contracts';
import { badRequest } from '../../lib/errors';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { serializeBigInts } from '../../lib/bigint';
import { getBalanceKobo } from './ledger.service';
import { createAddFundsIntent, getIntent, settleAddFunds } from './payments.service';
import { getPaymentProvider, MockPaymentProvider } from './provider';
import { ensureWallet } from './wallet.service';
import { handleProviderWebhook } from './webhook.service';
import { addCard, listCards, removeCard } from './cards.service';
import { withdrawToBank } from '../payouts/payouts.service';

const router = createRouter();

const intentSchema = z.object({ data: z.record(z.unknown()) });

// Auth gates (route-level middleware in createRoute breaks @hono/zod-openapi
// context inference, so apply them here instead).
router.use('/wallet', requireAuth);
router.use('/add-funds', requireAuth, requireVerifiedEmail);
router.use('/intents/*', requireAuth);
router.use('/cards', requireAuth);
router.use('/cards/*', requireAuth);
router.use('/withdraw', requireAuth, requireVerifiedEmail);

// ── GET /payments/wallet ─────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/wallet',
    tags: ['Payments'],
    summary: 'Get the current wallet balance',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Wallet balance', z.object({ data: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const user = c.get('user')!;
    const wallet = await ensureWallet(user.id);
    const balanceKobo = await getBalanceKobo(user.id);
    return c.json(
      {
        data: {
          currency: wallet.currency,
          balanceKobo,
          status: wallet.status,
          virtualNuban: wallet.providerVirtualNuban,
        },
      },
      200,
    );
  },
);

// ── POST /payments/add-funds ─────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/add-funds',
    tags: ['Payments'],
    summary: 'Create a wallet top-up intent (dynamic virtual account)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(P.createAddFundsIntentBody) },
    responses: {
      201: jsonResponse('Payment intent with a virtual account to pay into', intentSchema),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const user = c.get('user')!;
    const body = c.req.valid('json');
    const intent = await createAddFundsIntent(user.id, body.amountKobo);
    return c.json({ data: intent }, 201);
  },
);

// ── GET /payments/intents/{reference} ───────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/intents/{reference}',
    tags: ['Payments'],
    summary: 'Poll a payment intent status',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ reference: z.string() }) },
    responses: {
      200: jsonResponse('Payment intent', intentSchema),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const user = c.get('user')!;
    const { reference } = c.req.valid('param');
    return c.json({ data: await getIntent(user.id, reference) }, 200);
  },
);

// ── POST /payments/_mock/settle  (mock provider only) ───────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/_mock/settle',
    tags: ['Payments'],
    summary: 'DEV ONLY — simulate an inbound bank transfer for a reference',
    description:
      'Only available when PAYMENTS_PROVIDER=mock. Drives the same code path as a real `payin.received` webhook so the add-funds flow can be tested end-to-end without Anchor.',
    request: {
      body: jsonBody(z.object({ reference: z.string(), amountKobo: z.number().int().positive().optional() })),
    },
    responses: {
      200: jsonResponse('Settlement applied', z.object({ data: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const provider = getPaymentProvider();
    if (!(provider instanceof MockPaymentProvider)) {
      throw badRequest('Mock settlement is only available with PAYMENTS_PROVIDER=mock.');
    }
    const { reference, amountKobo } = c.req.valid('json');
    const { body, signature } = provider.buildSettlementEvent(reference);
    const result = await handleProviderWebhook(body, { 'x-anchor-signature': signature });
    if (!result.accepted) throw badRequest(`Mock settlement rejected: ${result.reason}`);
    // Also settle directly in case the reference wasn't a known pending DVA.
    if (amountKobo) await settleAddFunds(reference, BigInt(amountKobo)).catch(() => undefined);
    return c.json({ data: result }, 200);
  },
);

// ── POST /payments/webhooks/anchor ─────────────────────────────────────
router.post('/webhooks/anchor', async (c) => {
  const raw = await c.req.text();
  const headers: Record<string, string | undefined> = {
    'x-anchor-signature': c.req.header('x-anchor-signature'),
  };
  const result = await handleProviderWebhook(raw, headers);
  // Always 200 quickly so the provider doesn't retry a duplicate; failures are
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
    description: 'The card is tokenised by the payment provider on the client — genie never receives the PAN, CVV or PIN.',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(G.addCardBody) },
    responses: { 201: jsonResponse('Card added', intentSchema), ...commonErrorResponses },
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

// ── POST /payments/withdraw ───────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/withdraw',
    tags: ['Payments'],
    summary: 'Withdraw wallet balance to a bank account (NIP transfer)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(G.withdrawBody) },
    responses: {
      201: jsonResponse('Withdrawal initiated', intentSchema),
      409: jsonResponse('Insufficient funds', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const res = await withdrawToBank(c.get('user')!.id, c.req.valid('json'));
    return c.json(serializeBigInts({ data: res }), 201);
  },
);

// Register the webhook route in the OpenAPI doc without zod validation.
router.openAPIRegistry.registerPath({
  method: 'post',
  path: '/payments/webhooks/anchor',
  tags: ['Payments'],
  summary: 'Anchor webhook receiver (signature-verified)',
  request: { body: { content: { 'application/json': { schema: P.anchorWebhookEnvelope } } } },
  responses: { 200: { description: 'Event accepted' }, 202: { description: 'Event rejected but recorded' } },
});

export default router;
