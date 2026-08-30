import { createRoute } from '@hono/zod-openapi';
import { activities as A } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonResponse, z } from '../../lib/openapi';
import { requireAuth } from '../../middleware/auth';
import { listActivities } from './activities.service';

const router = createRouter();

router.use('*', requireAuth);

// ── GET /activities ───────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Activities'],
    summary: 'My activity feed (filter by category / action / date range)',
    security: [{ bearerAuth: [] }],
    request: { query: A.activityListQuery },
    responses: {
      200: jsonResponse(
        'Activity feed',
        z.object({ data: z.array(z.record(z.unknown())), meta: z.record(z.unknown()) }),
      ),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json(await listActivities(c.get('user')!.id, c.req.valid('query')), 200),
);

export default router;
