import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../../lib/router';
import { auth as C } from '@genie/contracts';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { rateLimit, RULES } from '../../lib/rate-limit';
import { requireAuth } from '../../middleware/auth';
import { notFound } from '../../lib/errors';
import { toMeResponse } from '../me/me.mapper';
import * as service from './auth.service';

const router = createRouter();

function device(c: { req: { header: (k: string) => string | undefined } }, body: { deviceId?: string; deviceName?: string }) {
  return {
    deviceId: body.deviceId ?? 'unknown-device',
    deviceName: body.deviceName,
    userAgent: c.req.header('user-agent'),
    ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip'),
  };
}

const clientIp = (c: { req: { header: (k: string) => string | undefined } }) =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'local';

const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresIn: z.number(),
  tokenType: z.literal('Bearer'),
});

const authResultSchema = z.object({
  data: z.object({
    user: z.record(z.unknown()),
    tokens: tokenPairSchema,
  }),
});

const messageSchema = z.object({ data: z.object({ message: z.string() }) });

// ── POST /auth/register (celebrant) ──────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/register',
    tags: ['Auth'],
    summary: 'Register a celebrant account (US0001)',
    request: { body: jsonBody(C.registerCelebrantBody) },
    responses: {
      201: jsonResponse(
        'Account created; an email verification code has been sent',
        z.object({
          data: z.object({
            userId: z.string(),
            email: z.string(),
            emailVerificationRequired: z.literal(true),
            message: z.string(),
            // Non-production only: the code, so a test build can pre-fill it.
            verificationCode: z.string().optional(),
          }),
        }),
      ),
      409: jsonResponse('Email or username already taken', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const body = c.req.valid('json');
    rateLimit(`register:${clientIp(c)}`, RULES.register);
    const { userId, email, verificationCode } = await service.registerCelebrant(body);
    return c.json(
      {
        data: {
          userId,
          email,
          emailVerificationRequired: true as const,
          message: 'Check your email for a 6-digit verification code.',
          ...(verificationCode ? { verificationCode } : {}),
        },
      },
      201,
    );
  },
);

// ── POST /auth/register/merchant ─────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/register/merchant',
    tags: ['Auth'],
    summary: 'Register a merchant account (US0004)',
    request: { body: jsonBody(C.registerMerchantBody) },
    responses: {
      201: jsonResponse(
        'Merchant account created; verification code sent',
        z.object({
          data: z.object({
            userId: z.string(),
            email: z.string(),
            emailVerificationRequired: z.literal(true),
            message: z.string(),
            verificationCode: z.string().optional(),
          }),
        }),
      ),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const body = c.req.valid('json');
    rateLimit(`register:${clientIp(c)}`, RULES.register);
    const { userId, email, verificationCode } = await service.registerMerchant(body);
    return c.json(
      {
        data: {
          userId,
          email,
          emailVerificationRequired: true as const,
          message: 'Check your email for a 6-digit verification code.',
          ...(verificationCode ? { verificationCode } : {}),
        },
      },
      201,
    );
  },
);

// ── POST /auth/verify-email ──────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/verify-email',
    tags: ['Auth'],
    summary: 'Verify email with the OTP and receive tokens',
    request: { body: jsonBody(C.verifyEmailBody) },
    responses: { 200: jsonResponse('Email verified; session issued', authResultSchema), ...commonErrorResponses },
  }),
  async (c) => {
    const body = c.req.valid('json');
    rateLimit(`otp:${body.email}`, RULES.otpVerify);
    const { tokens, user } = await service.verifyEmail(body.email, body.code, device(c, body));
    return c.json({ data: { user: await toMeResponse(user.id), tokens } }, 200);
  },
);

// ── POST /auth/resend-otp ────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/resend-otp',
    tags: ['Auth'],
    summary: 'Resend an email verification / password reset code',
    request: { body: jsonBody(C.resendOtpBody) },
    responses: {
      200: jsonResponse(
        'If the account exists, a code was sent',
        z.object({
          data: z.object({ message: z.string(), verificationCode: z.string().optional() }),
        }),
      ),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const body = c.req.valid('json');
    rateLimit(`otp-req:${body.email}`, RULES.otpRequest);
    const { verificationCode } = await service.resendOtp(body.email, body.purpose);
    return c.json(
      {
        data: {
          message: 'If that account exists, a new code has been sent.',
          ...(verificationCode ? { verificationCode } : {}),
        },
      },
      200,
    );
  },
);

// ── POST /auth/login ─────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/login',
    tags: ['Auth'],
    summary: 'Log in with email/username + password (US0002)',
    request: { body: jsonBody(C.loginBody) },
    responses: { 200: jsonResponse('Session issued', authResultSchema), ...commonErrorResponses },
  }),
  async (c) => {
    const body = c.req.valid('json');
    rateLimit(`login:${clientIp(c)}:${body.identifier}`, RULES.login);
    const { tokens, user } = await service.login(body.identifier, body.password, device(c, body));
    return c.json({ data: { user: await toMeResponse(user.id), tokens } }, 200);
  },
);

// ── POST /auth/refresh ───────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/refresh',
    tags: ['Auth'],
    summary: 'Rotate the refresh token (also powers biometric unlock)',
    request: { body: jsonBody(C.refreshBody) },
    responses: { 200: jsonResponse('New token pair', authResultSchema), ...commonErrorResponses },
  }),
  async (c) => {
    const body = c.req.valid('json');
    const { tokens, user } = await service.refresh(body.refreshToken, device(c, body));
    return c.json({ data: { user: await toMeResponse(user.id), tokens } }, 200);
  },
);

// ── POST /auth/logout ────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/logout',
    tags: ['Auth'],
    summary: 'Revoke the current device refresh token',
    request: { body: jsonBody(C.logoutBody) },
    responses: { 200: jsonResponse('Logged out', messageSchema), ...commonErrorResponses },
  }),
  async (c) => {
    const body = c.req.valid('json');
    await service.logout(body.refreshToken);
    return c.json({ data: { message: 'Signed out.' } }, 200);
  },
);

// ── POST /auth/password/forgot ───────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/password/forgot',
    tags: ['Auth'],
    summary: 'Request a password reset code (US0003)',
    request: { body: jsonBody(C.forgotPasswordBody) },
    responses: {
      200: jsonResponse(
        'If the account exists, a code was sent',
        z.object({
          data: z.object({ message: z.string(), verificationCode: z.string().optional() }),
        }),
      ),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const body = c.req.valid('json');
    rateLimit(`pwd-reset:${clientIp(c)}:${body.email}`, RULES.passwordReset);
    const { verificationCode } = await service.forgotPassword(body.email);
    return c.json(
      {
        data: {
          message: 'If that account exists, a reset code has been sent.',
          ...(verificationCode ? { verificationCode } : {}),
        },
      },
      200,
    );
  },
);

// ── POST /auth/password/reset ────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/password/reset',
    tags: ['Auth'],
    summary: 'Reset the password with an OTP (US0003)',
    request: { body: jsonBody(C.resetPasswordBody) },
    responses: { 200: jsonResponse('Password changed', messageSchema), ...commonErrorResponses },
  }),
  async (c) => {
    const body = c.req.valid('json');
    rateLimit(`otp:${body.email}`, RULES.otpVerify);
    await service.resetPassword(body.email, body.code, body.newPassword);
    return c.json({ data: { message: 'Your password has been reset. Please sign in.' } }, 200);
  },
);

// ── POST /auth/password/change (authenticated, US0023) ──────────────────
router.use('/password/change', requireAuth);
router.openapi(
  createRoute({
    method: 'post',
    path: '/password/change',
    tags: ['Auth'],
    summary: 'Change password while signed in (US0023)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(C.changePasswordBody) },
    responses: { 200: jsonResponse('Password changed; other sessions revoked', messageSchema), ...commonErrorResponses },
  }),
  async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user')!;
    await service.changePassword(user.id, body.currentPassword, body.newPassword);
    return c.json({ data: { message: 'Password updated. Please sign in again on your other devices.' } }, 200);
  },
);

// ── GET /auth/_dev/otp/{email}  (APP_ENV=local only) ───────────────────
// Lets the test console read back a code instead of scraping the server log.
router.get('/_dev/otp/:email', (c) => {
  const email = decodeURIComponent(c.req.param('email'));
  const purpose = (c.req.query('purpose') ?? 'EMAIL_VERIFY') as
    | 'EMAIL_VERIFY'
    | 'PASSWORD_RESET'
    | 'ACCOUNT_DELETE';
  const code = service.peekOtp(email, purpose);
  if (code == null) throw notFound('No peekable code (APP_ENV must be "local").');
  return c.json({ data: { email, purpose, code } }, 200);
});

export default router;
