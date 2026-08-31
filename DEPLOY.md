# Deploying genie

Three Vercel projects, all from this one repo, each with a different **Root
Directory**:

| Project | Root Directory | What it serves |
|---|---|---|
| `genie-api` | `apps/api` | the REST API (`/v1/*`) + the browser test console (`/console`) |
| `genie-landing` | `apps/landing` | the marketing / waitlist site |
| `genie-admin` | `apps/admin` | the internal admin portal |

The database is the existing **Neon** project (`ep-withered-flower-zah9wya9`,
`eu-west-2`). Migrations are run from a laptop (`npm run db:migrate` /
`migrate deploy`), **not** from Vercel.

---

## genie-api

### 1. Link the project

Either the CLI, or Vercel dashboard → *Add New… → Project* → import
`Genie-Business/genie_app_and_web` → set **Root Directory** to `apps/api`.
`apps/api/vercel.json` already sets the build & install commands and routes all
paths to the Hono function.

### 2. Environment variables

Add these under **Settings → Environment Variables** (all environments).
Generate the two JWT secrets fresh — do **not** reuse anything:

```bash
# run this twice, once per secret
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** URL — the `-pooler` host, with `?sslmode=require&pgbouncer=true&connect_timeout=15` | serverless functions must use the pooler |
| `DIRECT_URL` | Neon **direct** URL — no `-pooler`, `?sslmode=require` | |
| `JWT_ACCESS_SECRET` | (generated) | ≥ 16 chars |
| `JWT_REFRESH_SECRET` | (generated, different) | ≥ 16 chars |
| `APP_ENV` | `preview` | keeps `/console`; **echoes the OTP** in the register / resend response so the app can pre-fill it (never on `production`) |
| `PAYMENTS_PROVIDER` | `mock` | no Anchor account yet |
| `KYC_PROVIDER` | `mock` | |
| `PUSH_PROVIDER` | `log` | no FCM yet |
| `RESEND_API_KEY` | your Resend key | **needed to receive OTP emails** — see below |
| `EMAIL_FROM` | `genie <onboarding@resend.dev>` | Resend's shared sender works for your own address |
| `APP_PUBLIC_URL` | the landing URL once it exists, else the api URL | wishlist share links |
| `CORS_ORIGINS` | `*` | tighten later |

`NODE_ENV` is set to `production` by Vercel automatically — don't add it.

### 3. Resend (so signup OTPs actually arrive)

> With `APP_ENV=preview` the API also returns the code in the register /
> resend / forgot-password response and the app pre-fills it, so testing works
> even before Resend is set up. Set up Resend for a realistic flow (and it's
> required once `APP_ENV=production`).

1. Sign up at <https://resend.com> (free: 100/day).
2. **API Keys → Create** → copy into `RESEND_API_KEY`.
3. Without a verified domain you can only send to the address you signed up
   with — fine for testing on your own phone. Use
   `EMAIL_FROM=genie <onboarding@resend.dev>`.
4. To send to any address later: **Domains → Add** `genieapps.co`, add the DNS
   records, then `EMAIL_FROM=genie <no-reply@genieapps.co>`.

### 4. Deploy & verify

Push to `main` (or *Redeploy* in the dashboard). Auto-deploys land ~40s
after a push. Then:

```bash
curl https://genie-app-and-web-api.vercel.app/v1/health
# {"data":{"status":"ok","env":"preview","db":"up",...}}
```

Open `https://genie-app-and-web-api.vercel.app/console` to poke the live API.

> **Gotcha:** the Vercel function entry (`apps/api/api/index.ts`) MUST
> default-export `{ fetch }`, not a bare function. A bare function is called
> with the Node `(req, res)` signature, the returned `Response` is dropped,
> and every request hangs to a 60s `FUNCTION_INVOCATION_TIMEOUT`.

### 5. Point the app at it  ✅ done 2026-08-30

- Repo **Settings → Secrets and variables → Actions → Variables**:
  `API_BASE_URL` = `https://genie-app-and-web-api.vercel.app` (set).
- `.vscode/launch.json` + `apps/mobile/lib/core/env.dart` default already
  point there.

---

## genie-landing

**Root Directory** `apps/landing`. `apps/landing/vercel.json` sets the build
(`turbo run build --filter=@genie/landing`). No database access — it proxies
the waitlist POST to the API.

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://genie-app-and-web-api.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | the landing's own URL, e.g. `https://genie-landing.vercel.app` — set after the first deploy, then redeploy (drives `robots.txt`, `sitemap.xml`, OG tags) |

Verify: open the site, submit the waitlist form, confirm a `WaitlistSignup`
row (`npm run db:studio`). Check `/robots.txt` and `/sitemap.xml`.

## genie-admin

**Root Directory** `apps/admin`. `apps/admin/vercel.json` runs
`db:generate` then `turbo run build --filter=@genie/admin`. Server-only
(Prisma via the Neon adapter — no query-engine binary).

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** URL (same as the API's) |
| `DIRECT_URL` | Neon **direct** URL |
| `ADMIN_SESSION_SECRET` | generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

`NODE_ENV=production` is automatic. Log in at `/login` with the seeded admin
`admin@genieapps.co` — the password was printed once by `npm run db:seed`.
Lost it? Re-run the seed with `SEED_ADMIN_PASSWORD=<something>` set (the seed
leaves an existing admin's password unchanged, so first delete the row or
set the password via a one-off script).

Verify: `/` redirects to `/login` when signed out; after login the dashboard
shell renders.
