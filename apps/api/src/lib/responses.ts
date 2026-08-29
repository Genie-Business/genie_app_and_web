import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { serializeBigInts } from './bigint';

/** `{ data, meta? }` success envelope. */
export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200, meta?: unknown) {
  return c.json(serializeBigInts({ data, ...(meta ? { meta } : {}) }), status);
}

export function noContent(c: Context) {
  return c.body(null, 204);
}
