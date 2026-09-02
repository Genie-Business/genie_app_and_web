import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../../lib/router';
import { prisma } from '@genie/db';
import { misc as M } from '@genie/contracts';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { rateLimit } from '../../lib/rate-limit';

const router = createRouter();

router.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Waitlist'],
    summary: 'Join the genie waitlist (landing page)',
    request: { body: jsonBody(M.waitlistSignupBody) },
    responses: {
      201: jsonResponse('Signed up', z.object({ data: z.object({ message: z.string() }) })),
      200: jsonResponse('Already on the list', z.object({ data: z.object({ message: z.string() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const body = c.req.valid('json');
    const ip =
      c.req.header('x-vercel-forwarded-for')?.trim() ??
      c.req.header('x-real-ip')?.trim() ??
      'unknown';
    await rateLimit(`waitlist:${ip}`, { limit: 8, windowMs: 60 * 60_000 });

    const email = body.email.toLowerCase();
    const existing = await prisma.waitlistSignup.findUnique({ where: { email } });
    if (existing) {
      return c.json({ data: { message: "You're already on the list — we'll be in touch." } }, 200);
    }
    await prisma.waitlistSignup.create({
      data: { email, source: body.source, referrer: body.referrer },
    });
    return c.json({ data: { message: "You're on the list! We'll email you when genie is ready." } }, 201);
  },
);

export default router;
