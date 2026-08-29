import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../../lib/router';
import { prisma } from '@genie/db';
import { user as U } from '@genie/contracts';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { badRequest, conflict } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { isValidUsername } from '@genie/core';
import { toMeResponse } from './me.mapper';

const router = createRouter();

router.use('*', requireAuth);

// ── GET /me ──────────────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Me'],
    summary: 'Current user, profile and verification status',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('The signed-in user', z.object({ data: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const user = c.get('user')!;
    return c.json({ data: await toMeResponse(user.id) }, 200);
  },
);

// ── PATCH /me/username (only editable profile field, per "Profile settings") ──
router.openapi(
  createRoute({
    method: 'patch',
    path: '/username',
    tags: ['Me'],
    summary: 'Change username (the only editable profile field)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(U.updateUsernameBody) },
    responses: {
      200: jsonResponse('Updated user', z.object({ data: z.record(z.unknown()) })),
      409: jsonResponse('Username taken', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { username } = c.req.valid('json');
    const me = c.get('user')!;
    if (!isValidUsername(username)) throw badRequest('That username format is not allowed.');
    const clash = await prisma.user.findFirst({
      where: { username, status: 'ACTIVE', NOT: { id: me.id } },
      select: { id: true },
    });
    if (clash) throw conflict('username_taken', 'That username is already taken.');
    await prisma.user.update({ where: { id: me.id }, data: { username } });
    return c.json({ data: await toMeResponse(me.id) }, 200);
  },
);

export default router;
