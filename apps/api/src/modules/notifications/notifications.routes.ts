import { createRoute } from '@hono/zod-openapi';
import { notifications as N } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { requireAuth } from '../../middleware/auth';
import {
  getPreferences,
  listNotifications,
  markRead,
  unreadCount,
  updatePreferences,
} from './notify.service';
import { listDevices, registerDevice, removeDevice } from './devices.service';

const router = createRouter();

router.use('/notifications', requireAuth);
router.use('/notifications/*', requireAuth);
router.use('/devices', requireAuth);
router.use('/devices/*', requireAuth);

const dataObj = z.object({ data: z.record(z.unknown()) });
const dataArr = z.object({ data: z.array(z.record(z.unknown())) });

// ── GET /notifications ─────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/notifications',
    tags: ['Notifications'],
    summary: 'My notification feed (paginated)',
    security: [{ bearerAuth: [] }],
    request: { query: N.notificationListQuery },
    responses: {
      200: jsonResponse('Notifications', z.object({ data: z.array(z.record(z.unknown())), meta: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const q = c.req.valid('query');
    return c.json(await listNotifications(c.get('user')!.id, q), 200);
  },
);

// ── GET /notifications/unread-count ────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/notifications/unread-count',
    tags: ['Notifications'],
    summary: 'Badge count of unread notifications',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Count', z.object({ data: z.object({ count: z.number().int() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json({ data: { count: await unreadCount(c.get('user')!.id) } }, 200),
);

// ── POST /notifications/read ──────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/notifications/read',
    tags: ['Notifications'],
    summary: 'Mark notifications read (by id, or all)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(N.markReadBody) },
    responses: {
      200: jsonResponse('Marked', z.object({ data: z.object({ updated: z.number().int() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json({ data: { updated: await markRead(c.get('user')!.id, c.req.valid('json')) } }, 200),
);

// ── GET / PUT /notifications/preferences ──────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/notifications/preferences',
    tags: ['Notifications'],
    summary: 'Per-category push / email delivery preferences',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Preferences', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await getPreferences(c.get('user')!.id) }, 200),
);
router.openapi(
  createRoute({
    method: 'put',
    path: '/notifications/preferences',
    tags: ['Notifications'],
    summary: 'Update push / email preferences (in-app cannot be muted)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(N.updatePreferencesBody) },
    responses: { 200: jsonResponse('Updated preferences', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await updatePreferences(c.get('user')!.id, c.req.valid('json')) }, 200),
);

// ── Devices (push tokens) ─────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/devices',
    tags: ['Notifications'],
    summary: 'My registered devices',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Devices', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await listDevices(c.get('user')!.id) }, 200),
);
router.openapi(
  createRoute({
    method: 'post',
    path: '/devices',
    tags: ['Notifications'],
    summary: 'Register / refresh this device push token',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(N.registerDeviceBody) },
    responses: { 201: jsonResponse('Registered', dataObj), ...commonErrorResponses },
  }),
  async (c) => {
    const { fcmToken, platform } = c.req.valid('json');
    return c.json({ data: await registerDevice(c.get('user')!.id, fcmToken, platform) }, 201);
  },
);
router.openapi(
  createRoute({
    method: 'delete',
    path: '/devices/{token}',
    tags: ['Notifications'],
    summary: 'Unregister a device push token',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ token: z.string() }) },
    responses: {
      200: jsonResponse('Removed', z.object({ data: z.object({ message: z.string() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    await removeDevice(c.get('user')!.id, c.req.valid('param').token);
    return c.json({ data: { message: 'Device removed.' } }, 200);
  },
);

export default router;
