import './lib/bigint';
import { createRoute } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { prisma } from '@genie/db';
import { getEnv } from './env';
import { handleError, handleNotFound } from './middleware/error-handler';
import { requestContext } from './middleware/request-context';
import { jsonResponse, z } from './lib/openapi';
import { createRouter } from './lib/router';
import authRoutes from './modules/auth/auth.routes';
import meRoutes from './modules/me/me.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import waitlistRoutes from './modules/waitlist/waitlist.routes';
import { mountStubs } from './modules/stubs';

export function createApp() {
  const env = getEnv();
  const app = createRouter();

  app.onError(handleError);
  app.notFound(handleNotFound);

  app.use('*', requestContext);
  app.use(
    '*',
    cors({
      origin: env.CORS_ORIGINS === '*' ? '*' : env.CORS_ORIGINS.split(',').map((s) => s.trim()),
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
      maxAge: 86_400,
    }),
  );

  // ── Health ────────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/health',
      tags: ['System'],
      summary: 'Liveness + database connectivity',
      responses: {
        200: jsonResponse(
          'Healthy',
          z.object({
            data: z.object({
              status: z.literal('ok'),
              env: z.string(),
              db: z.enum(['up', 'down']),
              time: z.string(),
            }),
          }),
        ),
      },
    }),
    async (c) => {
      let db: 'up' | 'down' = 'up';
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        db = 'down';
      }
      return c.json(
        { data: { status: 'ok' as const, env: env.APP_ENV, db, time: new Date().toISOString() } },
        200,
      );
    },
  );

  // ── Feature routers ───────────────────────────────────────────────────
  app.route('/v1/auth', authRoutes);
  app.route('/v1/me', meRoutes);
  app.route('/v1/payments', paymentsRoutes);
  app.route('/v1/waitlist', waitlistRoutes);

  // ── Planned endpoints (501 + documented) ─────────────────────────────
  mountStubs(app);

  // ── OpenAPI document + security scheme ───────────────────────────────
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  app.doc31('/v1/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'genie API',
      version: '0.1.0',
      description:
        'API for the genie social-gifting platform. Milestone 1: authentication is fully implemented; other endpoints are documented but return 501.',
    },
    servers: [{ url: '/', description: 'current host' }],
  });

  app.get('/', (c) => c.redirect('/v1/health'));

  return app;
}

export type App = ReturnType<typeof createApp>;
