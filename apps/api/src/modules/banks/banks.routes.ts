import { createRoute } from '@hono/zod-openapi';
import { banks as B } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { clientIp } from '../../lib/client-ip';
import { badRequest, forbidden } from '../../lib/errors';
import { rateLimit, RULES } from '../../lib/rate-limit';
import { optionalAuth } from '../../middleware/auth';
import { emailFromSignupToken } from '../auth/auth.service';
import { listBanks, resolveAccount } from './banks.service';

const router = createRouter();

// ── GET /banks — the bank picker's list (public: merchants sign up before they have an account) ──
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Banks'],
    summary: 'Banks a merchant can settle to',
    responses: {
      200: jsonResponse('Banks, A to Z', z.object({ data: z.array(B.bankSchema) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json({ data: await listBanks() }, 200);
  },
);

// ── POST /banks/resolve — who owns this account? ──────────────────────────
// A name lookup tells the caller who holds an account number, so it is limited
// to people with a reason to ask: signed-in merchants, or someone mid-sign-up
// who has confirmed their email (they hold a signup token).
router.use('/resolve', optionalAuth);
router.openapi(
  createRoute({
    method: 'post',
    path: '/resolve',
    tags: ['Banks'],
    summary: 'Look up the account name for a bank and account number',
    description:
      'Signed-in merchants send their bearer token. During merchant sign-up (no account yet) send the `signupToken` you got from confirming your email instead.',
    request: { body: jsonBody(B.resolveAccountBody) },
    responses: {
      200: jsonResponse('The name on the account', z.object({ data: B.resolvedAccountSchema })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const input = c.req.valid('json');
    const ip = clientIp(c);
    await rateLimit(`bank-resolve:ip:${ip}`, RULES.bankResolveIp);

    const user = c.get('user');
    let subject: string;
    if (user) {
      if (user.role !== 'MERCHANT') throw forbidden('Only merchants can look up bank accounts.');
      subject = `user:${user.id}`;
    } else {
      let email: string | null = null;
      if (input.signupToken) email = await emailFromSignupToken(input.signupToken).catch(() => null);
      if (!email) {
        // Without this the endpoint would let anyone test guessed tokens.
        await rateLimit(`bank-resolve:bad-token:${ip}`, RULES.bankResolveBadCode);
        throw badRequest('Confirm your email before checking your bank account.');
      }
      subject = `signup:${email}`;
    }
    await rateLimit(`bank-resolve:subject:${subject}`, RULES.bankResolveSubject);

    return c.json({ data: await resolveAccount({ bankCode: input.bankCode, accountNumber: input.accountNumber }) }, 200);
  },
);

export default router;
