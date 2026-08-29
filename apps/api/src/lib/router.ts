import { OpenAPIHono } from '@hono/zod-openapi';
import type { Hook } from '@hono/zod-openapi';
import type { AppEnv } from '../types';

/**
 * Turn a failed zod validation into the standard `{ error: { code, message,
 * details } }` envelope instead of @hono/zod-openapi's raw `{ success, error }`.
 * defaultHook is per-instance, so every router (including sub-routers mounted
 * with `.route()`) must be created through here.
 */
export const validationHook: Hook<unknown, AppEnv, string, unknown> = (result, c) => {
  if (!result.success) {
    return c.json(
      {
        error: {
          code: 'validation_error',
          message: 'Some fields are invalid.',
          details: result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
          requestId: c.get('requestId'),
        },
      },
      400,
    );
  }
  return undefined;
};

export function createRouter() {
  return new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
}
