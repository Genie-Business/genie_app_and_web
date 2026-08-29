import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import { requireAuth, requireRole } from '../../middleware/auth';
import { feeSchedule } from './fees.service';

const router = createRouter();

router.openapi(
  createRoute({
    method: 'get',
    path: '/fees',
    tags: ['Fees'],
    summary: 'Current genie fee schedule (E008)',
    responses: {
      200: jsonResponse('Fee schedule', z.object({ data: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json(serializeBigInts({ data: await feeSchedule() }), 200),
);

router.use('/merchant/fees', requireAuth, requireRole('MERCHANT'));
router.openapi(
  createRoute({
    method: 'get',
    path: '/merchant/fees',
    tags: ['Merchant'],
    summary: 'Fees & commission I pay as a merchant (E008)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Merchant fee view', z.object({ data: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const s = await feeSchedule();
    return c.json(
      serializeBigInts({
        data: {
          commission: s.commission,
          note: 'Commission is deducted from each sale before it reaches your wallet. The transaction and logistics fees are paid by the gifter.',
          example: 'On a ₦10,000 item at ' + s.commission.label + ' commission, you receive ₦' +
            (10000 - (s.commission.type === 'PERCENT' ? 10000 * (s.commission.value / 100) : s.commission.value / 100)).toLocaleString(),
        },
      }),
      200,
    );
  },
);

export default router;
