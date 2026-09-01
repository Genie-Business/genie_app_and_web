import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'preview', 'production', 'test']).default('local'),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),
  OTP_TTL: z.coerce.number().int().positive().default(600),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('genie <no-reply@genieapps.co>'),

  /** Push delivery. `log` just writes to the logger (dev / no credentials). */
  PUSH_PROVIDER: z.enum(['log', 'fcm']).default('log'),
  FCM_PROJECT_ID: z.string().optional().default(''),
  FCM_CLIENT_EMAIL: z.string().optional().default(''),
  FCM_PRIVATE_KEY: z.string().optional().default(''),

  BLOB_READ_WRITE_TOKEN: z.string().optional().default(''),

  /** Identity verification. `mock` approves deterministically (no bureau call). */
  KYC_PROVIDER: z.enum(['mock', 'bureau']).default('mock'),
  KYC_BASE_URL: z.string().url().default('https://api.dojah.io'),
  KYC_API_KEY: z.string().optional().default(''),

  PAYMENTS_PROVIDER: z.enum(['mock', 'anchor']).default('mock'),
  ANCHOR_BASE_URL: z.string().url().default('https://api.sandbox.getanchor.co/api/v1'),
  ANCHOR_KEY: z.string().optional().default(''),
  ANCHOR_WEBHOOK_SECRET: z.string().optional().default(''),

  /**
   * Consumer web app base — used to build wishlist share links and referral
   * links. Defaults to the deployed landing site so a shared link works out of
   * the box; override for local dev (`APP_PUBLIC_URL=http://localhost:3000`).
   */
  APP_PUBLIC_URL: z.string().url().default('https://genie-app-and-web-landing.vercel.app'),
  CORS_ORIGINS: z.string().default('*'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** The server pepper used to hash OTP codes. */
export function otpPepper(): string {
  return getEnv().JWT_ACCESS_SECRET;
}
