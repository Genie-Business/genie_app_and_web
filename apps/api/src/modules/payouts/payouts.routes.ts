import { createRoute } from '@hono/zod-openapi';
import { gifts as G } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import { requireAuth, requireRole } from '../../middleware/auth';
import { getPayoutAccount, listPayouts, setPayoutAccount } from './payouts.service';

const router = createRouter();

router.use('*', requireAuth);

const dataObj = z.object({ data: z.record(z.unknown()) });

// ── GET /payouts ──────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Payouts'],
    summary: 'My payout / withdrawal history',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Payouts', z.object({ data: z.array(z.record(z.unknown())) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json(serializeBigInts({ data: await listPayouts(c.get('user')!.id) }), 200),
);

// ── GET / PUT /payouts/account  (merchant settlement bank) ─────────────
router.use('/account', requireRole('MERCHANT'));
router.openapi(
  createRoute({
    method: 'get',
    path: '/account',
    tags: ['Payouts'],
    summary: 'My settlement bank account (merchant)',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Account or null', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: (await getPayoutAccount(c.get('user')!.id)) ?? {} }, 200),
);
router.openapi(
  createRoute({
    method: 'put',
    path: '/account',
    tags: ['Payouts'],
    summary: 'Set / update my settlement bank account (merchant)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(G.payoutAccountBody) },
    responses: { 200: jsonResponse('Saved account', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await setPayoutAccount(c.get('user')!.id, c.req.valid('json')) }, 200),
);

export default router;
