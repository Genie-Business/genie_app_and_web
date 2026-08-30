import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../types';
import { ErrorSchema } from '../lib/openapi';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type Stub = [Method, string, string, string];

/**
 * Endpoints whose contract is fixed but whose implementation lands in a later
 * milestone. They return 501 and appear in the OpenAPI spec marked
 * `x-genie-status: planned`. As of Milestone 7 every epic is implemented, so
 * this list is empty — the mechanism stays for future additions.
 */
const STUBS: Stub[] = [];

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
