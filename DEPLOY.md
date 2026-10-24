# Deploying genie

Two Vercel projects, both from this one repo, each with a different **Root
Directory**:

| Project | Root Directory | What it serves |
|---|---|---|
| `genie-app-and-web-api` | `apps/api` | the REST API (`/v1/*`) + the browser test console (`/console`) |
| `genie-app-and-web-landing` | `apps/landing` | **two hostnames from one app:** the public site (marketing pages, wishlist pages, legal) and the admin portal on its own host (`admin.getgenie.gift`) |

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
| `JWT_ACCESS_SECRET` | (generated) | ≥ 16 chars — 48+ random bytes strongly preferred |
| `JWT_REFRESH_SECRET` | (generated, different) | ≥ 16 chars |
| `APP_ENV` | **`production`** | hardened: no `/console`, no OTP echo. Use `preview` only for a throwaway environment. |
| `PAYMENTS_PROVIDER` | `mock` | no Anchor account yet |
| `KYC_PROVIDER` | `mock` | |
| `PUSH_PROVIDER` | `log` | no FCM yet |
| `RESEND_API_KEY` | your Resend key | **required** once `APP_ENV=production` — otherwise no one can verify their email |
| `EMAIL_FROM` | `genie <onboarding@resend.dev>` | Resend's shared sender only delivers to your own address; verify `genieapps.co` for real users |
| `APP_PUBLIC_URL` | landing URL (default is already correct) | wishlist + referral links |
| `CORS_ORIGINS` | *(leave unset)* | defaults to the landing + admin origins; the mobile app sends no Origin and is unaffected |
| `OTP_ECHO_EMAILS` | *(optional)* `you@x.com,tester@y.com` | echoes the OTP **only** for these exact addresses, even in production — a safe way to run a tiny closed beta before Resend has a verified domain. Never put a real user's address here. |
| `ADMIN_SESSION_SECRET` (admin project) | 32+ random chars | the admin app now **refuses to start** in production without it |

> **Do not set `OTP_DEBUG_ECHO` anywhere that is reachable from the internet.**
> It echoes every OTP to the caller, which turns "forgot password" into an
> account-takeover. It exists for a local, offline dev machine only.

`NODE_ENV` is set to `production` by Vercel automatically — don't add it.

### 3. Resend (so signup OTPs actually arrive)

> On a hardened deploy (`APP_ENV=production`) the OTP is never echoed. Set up
> Resend, or list a couple of tester addresses in `OTP_ECHO_EMAILS`, so email
> verification and password reset can complete.

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

## genie-app-and-web-landing  (public site + admin portal)

**Root Directory** `apps/landing`. `apps/landing/vercel.json` runs `db:generate`, then
`turbo run build --filter=@genie/landing`.

One Next.js app answers on two hostnames (`src/middleware.ts`):

- **Public host** (`genie-app-and-web-landing.vercel.app`, or your marketing domain): `/`, `/product`,
  `/team` (the 3D static pages — see `apps/landing/SITE.md`), `/w/[id]`, `/join`, `/privacy`,
  `/terms`, `/api/waitlist`. `/admin/*` is a 404 here.
- **Admin host** (`ADMIN_HOSTS`, default `admin.getgenie.gift`): every path is rewritten under the
  internal `/admin` route; signed-out visitors are sent to `/login`. Admin gets its own CSP,
  `noindex`, and a host-only session cookie that the public host never sees.

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://genie-app-and-web-api.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | the public site's own URL (drives `robots.txt`, `sitemap.xml`, OG tags) |
| `DATABASE_URL` | Neon URL for the admin portal's Prisma client (the direct host works fine — it's low traffic) |
| `DIRECT_URL` | Neon **direct** URL |
| `ADMIN_SESSION_SECRET` | 32+ random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` — the app **refuses to start the admin** in production without it |
| `ADMIN_HOSTS` | comma-separated admin hostnames, e.g. `admin.getgenie.gift` (anything else is the public site) |

**Admin domain:** `admin.getgenie.gift` is added to this project. `getgenie.gift`'s DNS lives at the
registrar (Namecheap), so create one record there: **CNAME**, host `admin`, value `cname.vercel-dns.com`. Until the domain resolves you can test by adding the
project's preview hostname to `ADMIN_HOSTS`.

`NODE_ENV=production` is automatic. Create the first admin from a laptop with
`node --env-file=../../.env scripts/create-admin.mjs --email you@genieapps.co --name "You" --role SUPER_ADMIN`
(run from `packages/db`); after that add people from the portal's **Team** page.

Verify: the public host serves the 3D home page and `/admin` 404s; the admin host redirects to
`/login`, and after signing in the dashboard renders.

**Local dev:** `npm run dev --workspace @genie/landing` → public site at http://localhost:3000,
admin at http://admin.localhost:3000 (browsers resolve `*.localhost` to your machine). Put
`DATABASE_URL`, `DIRECT_URL` and `ADMIN_SESSION_SECRET` in `apps/landing/.env.local`
(see `.env.local.example`).
