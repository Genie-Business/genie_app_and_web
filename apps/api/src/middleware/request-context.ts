import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { logger } from '../lib/logger';

/** Attach a request id + structured access logging. */
export const requestContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);

  const start = Date.now();
  await next();
  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - start,
    },
    'request',
  );
};
