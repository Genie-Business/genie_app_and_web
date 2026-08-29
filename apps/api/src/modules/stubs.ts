import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../types';
import { ErrorSchema } from '../lib/openapi';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type Stub = [Method, string, string, string];

/**
 * Endpoints whose contract is fixed for Milestone 1 but whose implementation
 * lands later. They return 501 and appear in the OpenAPI spec marked
 * `x-genie-status: planned`, so the Flutter and admin teams can build against
 * the shapes today.
 */
const STUBS: Stub[] = [
  // Carts (E013)
  ['get', '/v1/cart', 'Cart', 'Get my open cart'],
  ['post', '/v1/cart/items', 'Cart', 'Add/update a product in the cart'],
  ['delete', '/v1/cart/items/{itemId}', 'Cart', 'Remove a product from the cart'],
  // Friends & social (E007)
  ['get', '/v1/friends', 'Friends', 'My friends list'],
  ['post', '/v1/friends/requests', 'Friends', 'Send a friend request'],
  ['post', '/v1/friends/import-contacts', 'Friends', 'Import contacts & match genie users'],
  ['get', '/v1/messages/threads', 'Friends', 'Instant messaging threads'],
  // Referrals (E011)
  ['get', '/v1/referrals', 'Referrals', 'My referral code + who I referred'],
  // Notifications (E010)
  ['get', '/v1/notifications', 'Notifications', 'My notifications'],
  ['post', '/v1/notifications/read', 'Notifications', 'Mark notifications read'],
  ['post', '/v1/devices', 'Notifications', 'Register a device push token'],
  ['delete', '/v1/devices/{token}', 'Notifications', 'Remove a device push token'],
  // Activities (E009)
  ['get', '/v1/activities', 'Activities', 'My activity feed (filter by date/type/txn)'],
  // Settings (E011)
  ['post', '/v1/me/delete/request', 'Me', 'Request account deletion (sends OTP)'],
  ['post', '/v1/me/delete/confirm', 'Me', 'Confirm account deletion with OTP'],
  ['get', '/v1/settings/allowed-countries', 'Me', 'Countries/states available on genie'],
  // Support (E011)
  ['post', '/v1/support/threads', 'Support', 'Start a "Talk to us" support thread'],
  ['get', '/v1/support/threads', 'Support', 'My support threads'],
  // KYC (E002)
  ['post', '/v1/kyc/level-1', 'KYC', 'Submit Level 1 verification (selfie + ID doc)'],
  ['get', '/v1/kyc', 'KYC', 'My verification status'],
];

export function mountStubs(app: OpenAPIHono<AppEnv>) {
  for (const [method, path, tag, summary] of STUBS) {
    app.openAPIRegistry.registerPath({
      method,
      path,
      tags: [tag],
      summary,
      description: 'Planned for a later milestone — currently returns 501.',
      'x-genie-status': 'planned',
      responses: {
        501: { description: 'Not implemented yet', content: { 'application/json': { schema: ErrorSchema } } },
      },
    } as Parameters<typeof app.openAPIRegistry.registerPath>[0]);

    // Hono uses ':param' syntax, OpenAPI uses '{param}'.
    const honoPath = path.replace(/\{([^}]+)\}/g, ':$1');
    app.on(method.toUpperCase(), honoPath, (c) =>
      c.json(
        {
          error: {
            code: 'not_implemented',
            message: `${summary} — coming in a later milestone.`,
            requestId: c.get('requestId'),
          },
        },
        501,
      ),
    );
  }
}
