import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import { requireAuth } from '../../middleware/auth';
import { getMyReferrals } from './referrals.service';

const router = createRouter();

router.use('*', requireAuth);

// ── GET /referrals ────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Referrals'],
    summary: 'My referral code, share link, and who I have referred',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Referral summary', z.object({ data: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json(serializeBigInts({ data: await getMyReferrals(c.get('user')!.id) }), 200),
);

export default router;
