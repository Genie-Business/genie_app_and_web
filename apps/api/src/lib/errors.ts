import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ErrorDetail = { path: string; message: string };

/**
 * A domain error that maps cleanly onto the `{ error: { code, message } }`
 * envelope. Throw these from services and routes; the error middleware renders
 * them.
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details?: ErrorDetail[];
  readonly expose: boolean;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    opts: { details?: ErrorDetail[]; expose?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = opts.details;
    this.expose = opts.expose ?? true;
  }
}

export const badRequest = (message: string, details?: ErrorDetail[]) =>
  new AppError(400, 'bad_request', message, { details });

export const unauthorized = (message = 'Authentication required.') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message);

export const conflict = (code: string, message: string) => new AppError(409, code, message);

export const tooManyRequests = (message = 'Too many attempts. Please try again later.') =>
  new AppError(429, 'rate_limited', message);

export const notImplemented = (message = 'This endpoint is not implemented yet.') =>
  new AppError(501, 'not_implemented', message);

export const internal = (message = 'Something went wrong.') =>
  new AppError(500, 'internal_error', message, { expose: false });
