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
| `APP_ENV` | `preview` | keeps `/console`; enables nothing dangerous |
| `PAYMENTS_PROVIDER` | `mock` | no Anchor account yet |
| `KYC_PROVIDER` | `mock` | |
| `PUSH_PROVIDER` | `log` | no FCM yet |
| `RESEND_API_KEY` | your Resend key | **needed to receive OTP emails** — see below |
| `EMAIL_FROM` | `genie <onboarding@resend.dev>` | Resend's shared sender works for your own address |
| `APP_PUBLIC_URL` | the landing URL once it exists, else the api URL | wishlist share links |
| `CORS_ORIGINS` | `*` | tighten later |

`NODE_ENV` is set to `production` by Vercel automatically — don't add it.

### 3. Resend (so signup OTPs actually arrive)

1. Sign up at <https://resend.com> (free: 100/day).
2. **API Keys → Create** → copy into `RESEND_API_KEY`.
3. Without a verified domain you can only send to the address you signed up
   with — fine for testing on your own phone. Use
   `EMAIL_FROM=genie <onboarding@resend.dev>`.
4. To send to any address later: **Domains → Add** `genieapps.co`, add the DNS
   records, then `EMAIL_FROM=genie <no-reply@genieapps.co>`.

### 4. Deploy & verify

Push to `main` (or *Redeploy* in the dashboard). Then:

```bash
curl https://<your-api>.vercel.app/v1/health
# {"data":{"status":"ok","env":"preview","db":"up",...}}
```

Open `https://<your-api>.vercel.app/console` in a browser to poke the live API.

### 5. Point the app at it

- Repo **Settings → Secrets and variables → Actions → Variables**: set
  `API_BASE_URL` = `https://<your-api>.vercel.app`. The next `main` build's
  `genie-android-apk` artifact will target it.
- `.vscode/launch.json`: replace `REPLACE-WITH-YOUR-VERCEL-URL` in the
  *deployed API* configs.
- `apps/mobile/lib/core/env.dart`: update the `defaultValue` if you want it
  baked in without a `--dart-define`.

---

## genie-landing / genie-admin

Same flow, Root Directory `apps/landing` / `apps/admin`.

- **landing** needs `NEXT_PUBLIC_API_BASE_URL` = the api URL, and
  `DATABASE_URL` (it reads `AppSetting` for CRM content + writes
  `WaitlistSignup`).
- **admin** needs `DATABASE_URL`, `DIRECT_URL` and `ADMIN_SESSION_SECRET`
  (generate like the JWT secrets). Log in with the seeded admin
  (`admin@genieapps.co` — password from the seed run).
