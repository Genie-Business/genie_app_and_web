import { createRoute } from '@hono/zod-openapi';
import { settings as S } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import {
  confirmDeletion,
  getAllowedCountries,
  listSessions,
  requestDeletion,
  revokeOtherSessions,
  revokeSession,
  updateProfile,
} from './settings.service';

const router = createRouter();

const dataObj = z.object({ data: z.record(z.unknown()) });
const dataArr = z.object({ data: z.array(z.record(z.unknown())) });
const messageObj = z.object({ data: z.object({ message: z.string() }) });

// ── GET /settings/allowed-countries  (no auth — used during onboarding) ──
router.openapi(
  createRoute({
    method: 'get',
    path: '/settings/allowed-countries',
    tags: ['Settings'],
    summary: 'Countries and states available on genie',
    responses: { 200: jsonResponse('Countries', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await getAllowedCountries() }, 200),
);

// Everything below is authenticated.
router.use('/me/profile', requireAuth, requireVerifiedEmail);
router.use('/me/sessions', requireAuth);
router.use('/me/sessions/*', requireAuth);
router.use('/me/delete/request', requireAuth, requireVerifiedEmail);
router.use('/me/delete/confirm', requireAuth);

// ── PATCH /me/profile ─────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'patch',
    path: '/me/profile',
    tags: ['Settings'],
    summary: 'Update editable profile fields (DOB, address, state)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(S.updateProfileBody) },
    responses: { 200: jsonResponse('Updated', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await updateProfile(c.get('user')!.id, c.req.valid('json')) }, 200),
);

// ── GET /me/sessions ─────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/me/sessions',
    tags: ['Settings'],
    summary: 'Where I am signed in (active refresh tokens)',
    security: [{ bearerAuth: [] }],
    request: { query: z.object({ deviceId: z.string().optional() }) },
    responses: { 200: jsonResponse('Sessions', dataArr), ...commonErrorResponses },
  }),
  async (c) =>
    c.json({ data: await listSessions(c.get('user')!.id, c.req.valid('query').deviceId) }, 200),
);

// ── DELETE /me/sessions/{id} ─────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'delete',
    path: '/me/sessions/{id}',
    tags: ['Settings'],
    summary: 'Sign out one device',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: jsonResponse('Revoked', messageObj), ...commonErrorResponses },
  }),
  async (c) => {
    await revokeSession(c.get('user')!.id, c.req.valid('param').id);
    return c.json({ data: { message: 'Signed out on that device.' } }, 200);
  },
);

// ── POST /me/sessions/revoke-others ──────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/me/sessions/revoke-others',
    tags: ['Settings'],
    summary: 'Sign out everywhere except this device',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(S.revokeOtherSessionsBody) },
    responses: { 200: jsonResponse('Revoked', dataObj), ...commonErrorResponses },
  }),
  async (c) =>
    c.json({ data: await revokeOtherSessions(c.get('user')!.id, c.req.valid('json').deviceId) }, 200),
);

// ── POST /me/delete/request | /confirm ──────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/me/delete/request',
    tags: ['Settings'],
    summary: 'Request account deletion (sends a confirmation code)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Code sent (or 400 if the wallet is not empty / a settlement is pending)', messageObj),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json({ data: await requestDeletion(c.get('user')!.id) }, 200),
);
router.openapi(
  createRoute({
    method: 'post',
    path: '/me/delete/confirm',
    tags: ['Settings'],
    summary: 'Confirm and permanently delete the account',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(S.deleteAccountConfirmBody) },
    responses: { 200: jsonResponse('Deleted', messageObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await confirmDeletion(c.get('user')!.id, c.req.valid('json').code) }, 200),
);

export default router;
