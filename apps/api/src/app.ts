import './lib/bigint';
import { createRoute } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { prisma } from '@genie/db';
import { getEnv } from './env';
import { handleError, handleNotFound } from './middleware/error-handler';
import { requestContext } from './middleware/request-context';
import { jsonResponse, z } from './lib/openapi';
import { createRouter } from './lib/router';
import { CONSOLE_HTML } from './console/console-html';
import authRoutes from './modules/auth/auth.routes';
import meRoutes from './modules/me/me.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import waitlistRoutes from './modules/waitlist/waitlist.routes';
import catalogRoutes from './modules/catalog/catalog.routes';
import merchantRoutes from './modules/merchant/merchant.routes';
import eventsRoutes from './modules/events/events.routes';
import wishlistsRoutes from './modules/wishlists/wishlists.routes';
import publicRoutes from './modules/public/public.routes';
import giftsRoutes from './modules/gifts/gifts.routes';
import feesRoutes from './modules/fees/fees.routes';
import payoutsRoutes from './modules/payouts/payouts.routes';
import ordersRoutes from './modules/orders/orders.routes';
import friendsRoutes from './modules/friends/friends.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import referralsRoutes from './modules/referrals/referrals.routes';
import activitiesRoutes from './modules/activities/activities.routes';
import kycRoutes from './modules/kyc/kyc.routes';
import settingsRoutes from './modules/settings/settings.routes';
import supportRoutes from './modules/support/support.routes';
import cartRoutes from './modules/cart/cart.routes';
import messagesRoutes from './modules/messages/messages.routes';
import { mountStubs } from './modules/stubs';

export function createApp() {
  const env = getEnv();
  const app = createRouter();

  app.onError(handleError);
  app.notFound(handleNotFound);

  app.use('*', requestContext);

  // Hardening headers on every response. This is a JSON API served over HTTPS
  // and never framed, so the policy is deliberately tight.
  app.use(
    '*',
    secureHeaders({
      strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'no-referrer',
      crossOriginResourcePolicy: 'same-site',
      crossOriginOpenerPolicy: 'same-origin',
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        // The dev console (local only) needs inline styles/scripts + fetch to self.
        ...(env.APP_ENV === 'local'
          ? {
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              connectSrc: ["'self'"],
            }
          : {}),
      },
      xPermittedCrossDomainPolicies: 'none',
      xDnsPrefetchControl: 'off',
    }),
  );

  const allowedOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (env.CORS_ORIGINS === '*') return origin ?? '*';
        // Reflect only known origins; everything else gets no CORS header
        // (native apps send no Origin and are unaffected).
        return origin && allowedOrigins.includes(origin) ? origin : null;
      },
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
  // settingsRoutes owns /v1/me/{profile,sessions,delete} + /v1/settings/* — it must
  // sit before meRoutes so those paths aren't swallowed by meRoutes' catch-all auth.
  app.route('/v1', settingsRoutes);
  app.route('/v1/me', meRoutes);
  app.route('/v1/payments', paymentsRoutes);
  app.route('/v1/waitlist', waitlistRoutes);
  app.route('/v1', catalogRoutes); // /v1/categories, /v1/products
  app.route('/v1', feesRoutes); // /v1/fees, /v1/merchant/fees
  app.route('/v1/merchant', merchantRoutes);
  app.route('/v1/events', eventsRoutes);
  app.route('/v1/wishlists', wishlistsRoutes);
  app.route('/v1/gifts', giftsRoutes);
  app.route('/v1/orders', ordersRoutes);
  app.route('/v1/payouts', payoutsRoutes);
  app.route('/v1/friends', friendsRoutes);
  app.route('/v1', notificationsRoutes); // /v1/notifications, /v1/devices
  app.route('/v1/referrals', referralsRoutes);
  app.route('/v1/activities', activitiesRoutes);
  app.route('/v1/kyc', kycRoutes);
  app.route('/v1/support', supportRoutes);
  app.route('/v1/cart', cartRoutes);
  app.route('/v1/messages', messagesRoutes);
  app.route('/v1/public', publicRoutes);

  // ── Planned endpoints (501 + documented) — none left; every epic is live.
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
      version: '0.7.0',
      description:
        'API for the genie social-gifting platform. All 14 epics are implemented: auth & onboarding, KYC Level 1 (mock bureau), events, wishlists, gifting (wallet + bank transfer) with anonymous gifts, merchants & catalog, friends & contact matching, fees & commission, activity feed, notifications & push, settings (profile, sessions, account deletion) & support, payments (wallet, cards, payouts, withdrawals), the gift cart, order management & delivery, and 1:1 instant messaging between friends. Payments run through a mock provider until Anchor keys are set.',
    },
    servers: [{ url: '/', description: 'current host' }],
  });

  // ── Test console — local only. It is a full attack-surface UI, so it is
  //    never registered on a deployed environment (preview or production).
  if (env.APP_ENV === 'local') {
    app.get('/console', (c) =>
      c.html(CONSOLE_HTML, 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }),
    );
    app.get('/', (c) => c.redirect('/console'));
  } else {
    app.get('/', (c) => c.redirect('/v1/health'));
  }

  return app;
}

export type App = ReturnType<typeof createApp>;
