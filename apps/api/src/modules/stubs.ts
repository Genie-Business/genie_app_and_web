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
  // Instant messaging (E007) — needs its own schema; later milestone
  ['get', '/v1/messages/threads', 'Friends', 'Instant messaging threads'],
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
