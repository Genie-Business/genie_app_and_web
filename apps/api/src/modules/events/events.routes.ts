import { createRoute } from '@hono/zod-openapi';
import { events as E } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { requireAuth } from '../../middleware/auth';
import * as service from './events.service';

const router = createRouter();

router.use('*', requireAuth);

const eventResponse = z.object({ data: z.record(z.unknown()) });

// ── GET /events/dashboard ──────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/dashboard',
    tags: ['Events'],
    summary: 'Dashboard totals + recent events with progress (US0008/US0009)',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Dashboard', eventResponse), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await service.dashboard(c.get('user')!.id) }, 200),
);

// ── GET /events ────────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Events'],
    summary: 'List my events',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Events', z.object({ data: z.array(z.record(z.unknown())) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json({ data: await service.listEvents(c.get('user')!.id) }, 200),
);

// ── POST /events ───────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Events'],
    summary: 'Create an event (US0014)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(E.createEventBody) },
    responses: {
      201: jsonResponse('Event created', eventResponse),
      409: jsonResponse('Event name already used', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const event = await service.createEvent(c.get('user')!.id, c.req.valid('json'));
    return c.json({ data: event }, 201);
  },
);

// ── GET /events/{id} ──────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Events'],
    summary: 'Get an event',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: jsonResponse('Event', eventResponse), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await service.getEvent(c.get('user')!.id, c.req.valid('param').id) }, 200),
);

// ── PATCH /events/{id} ────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['Events'],
    summary: 'Edit an event',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }), body: jsonBody(E.updateEventBody) },
    responses: { 200: jsonResponse('Updated event', eventResponse), ...commonErrorResponses },
  }),
  async (c) => {
    const event = await service.updateEvent(
      c.get('user')!.id,
      c.req.valid('param').id,
      c.req.valid('json'),
    );
    return c.json({ data: event }, 200);
  },
);

// ── DELETE /events/{id} ───────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Events'],
    summary: 'Delete an event (kept in history)',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: jsonResponse('Deleted', z.object({ data: z.object({ message: z.string() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    await service.deleteEvent(c.get('user')!.id, c.req.valid('param').id);
    return c.json({ data: { message: 'Event deleted. Your gift history is kept.' } }, 200);
  },
);

export default router;
