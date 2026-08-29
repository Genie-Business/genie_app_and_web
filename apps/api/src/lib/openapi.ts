import { z } from '@hono/zod-openapi';

/** Standard error response body, reused across every route's error responses. */
export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'bad_request' }),
      message: z.string(),
      details: z
        .array(z.object({ path: z.string(), message: z.string() }))
        .optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('Error');

/** Wrap a data schema in the `{ data }` success envelope. */
export const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ data });

export const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { 'application/json': { schema } },
});

export const jsonResponse = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { 'application/json': { schema } },
});

export const commonErrorResponses = {
  400: jsonResponse('Validation or business-rule failure', ErrorSchema),
  401: jsonResponse('Missing or invalid credentials', ErrorSchema),
  429: jsonResponse('Rate limited', ErrorSchema),
  500: jsonResponse('Unexpected error', ErrorSchema),
};

export { z };
