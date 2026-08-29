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
  // Events (E003)
  ['post', '/v1/events', 'Events', 'Create an event (US0014)'],
  ['get', '/v1/events', 'Events', 'List my events + dashboard totals (US0008/US0009)'],
  ['get', '/v1/events/{id}', 'Events', 'Get an event'],
  ['patch', '/v1/events/{id}', 'Events', 'Edit an event'],
  ['delete', '/v1/events/{id}', 'Events', 'Delete an event (kept in history)'],
  // Wishlists (E004)
  ['post', '/v1/wishlists', 'Wishlists', 'Create a wishlist for an event'],
  ['get', '/v1/wishlists/{id}', 'Wishlists', 'Get a wishlist with its items'],
  ['post', '/v1/wishlists/{id}/items', 'Wishlists', 'Add/update a product on a wishlist'],
  ['delete', '/v1/wishlists/{id}/items/{itemId}', 'Wishlists', 'Remove an item from a wishlist'],
  ['get', '/v1/wishlists/{id}/share', 'Wishlists', 'Get a shareable link for a wishlist'],
  // Carts (E013)
  ['get', '/v1/cart', 'Cart', 'Get my open cart'],
  ['post', '/v1/cart/items', 'Cart', 'Add/update a product in the cart'],
  ['delete', '/v1/cart/items/{itemId}', 'Cart', 'Remove a product from the cart'],
  // Catalog (E013)
  ['get', '/v1/categories', 'Catalog', 'List product categories'],
  ['post', '/v1/categories/requests', 'Catalog', 'Request a new category (merchant)'],
  ['get', '/v1/products', 'Catalog', 'Browse products'],
  ['get', '/v1/products/{id}', 'Catalog', 'Get a product'],
  // Merchant (E006 / E014)
  ['post', '/v1/merchant/products', 'Merchant', 'Add a product/service (US0013)'],
  ['patch', '/v1/merchant/products/{id}', 'Merchant', 'Edit a product/service'],
  ['delete', '/v1/merchant/products/{id}', 'Merchant', 'Delete a product/service'],
  ['get', '/v1/merchant/products', 'Merchant', 'List my products/services'],
  ['put', '/v1/merchant/products/{id}/inventory', 'Merchant', 'Update inventory / available stock'],
  ['get', '/v1/merchant/orders', 'Merchant', 'List orders for my products (US Vendor Orders)'],
  ['patch', '/v1/merchant/orders/{id}/delivery', 'Merchant', 'Update delivery status'],
  ['get', '/v1/merchant/fees', 'Merchant', 'See applicable fees & commission (E008)'],
  // Gifting (E005)
  ['post', '/v1/gifts', 'Gifts', 'Add an anonymous / named gift to a wishlist item (US0016)'],
  ['get', '/v1/gifts/received', 'Gifts', 'Gifts received for my events'],
  ['post', '/v1/gifts/{id}/reveal', 'Gifts', 'Reveal an anonymous gift on physical receipt'],
  // Orders (E012)
  ['get', '/v1/orders', 'Orders', 'My orders as a buyer'],
  ['get', '/v1/orders/{id}', 'Orders', 'Order detail'],
  // Payments — pay for a gift (E012)
  ['post', '/v1/payments/pay-for-gift', 'Payments', 'Pay for a wishlist gift (US0019)'],
  ['get', '/v1/payments/cards', 'Payments', 'List saved cards'],
  ['post', '/v1/payments/cards', 'Payments', 'Add a (tokenised) card'],
  ['delete', '/v1/payments/cards/{id}', 'Payments', 'Remove a card'],
  ['post', '/v1/payments/withdraw', 'Payments', 'Withdraw wallet balance to a bank account'],
  // Payouts (merchant settlement)
  ['get', '/v1/payouts', 'Payouts', 'My payout history (merchant)'],
  ['put', '/v1/payouts/account', 'Payouts', 'Set/verify my settlement bank account'],
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
