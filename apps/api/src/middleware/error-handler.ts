import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { AppEnv } from '../types';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
    requestId?: string;
  };
};

export const handleError: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId');

  if (err instanceof AppError) {
    const body: ErrorBody = {
      error: {
        code: err.code,
        message: err.expose ? err.message : 'Something went wrong.',
        details: err.details,
        requestId,
      },
    };
    if (!err.expose) logger.error({ err, requestId }, 'AppError (masked)');
    return c.json(body, err.status);
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'validation_error',
          message: 'Some fields are invalid.',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          requestId,
        },
      } satisfies ErrorBody,
      400,
    );
  }

  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: 'http_error', message: err.message, requestId } } satisfies ErrorBody,
      err.status,
    );
  }

  logger.error({ err, requestId }, 'Unhandled error');
  return c.json(
    { error: { code: 'internal_error', message: 'Something went wrong.', requestId } } satisfies ErrorBody,
    500,
  );
};

export const handleNotFound: NotFoundHandler<AppEnv> = (c) => {
  return c.json(
    {
      error: {
        code: 'not_found',
        message: `No route for ${c.req.method} ${c.req.path}`,
        requestId: c.get('requestId'),
      },
    },
    404,
  );
};
