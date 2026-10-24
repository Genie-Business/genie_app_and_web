# Deploying genie

**One Vercel project**, `genie-app-and-web-landing`, **Root Directory `apps/landing`**, serves everything:

| What | Where |
|---|---|
| Marketing site (3D pages), wishlist pages, legal | `https://www.getgenie.gift` (the apex `getgenie.gift` redirects to `www`) |
| REST API (`/v1/*`) | the same host — `https://www.getgenie.gift/v1/health`, `/v1/openapi.json`, … |
| Admin portal | `https://admin.getgenie.gift` (its own hostname, same app) |

The database is the **Neon** project (`ep-withered-flower-zah9wya9`, `eu-west-2`). Migrations are run
from a laptop (`npm run db:migrate` / `migrate deploy`), **not** from Vercel.

`apps/landing/vercel.json` builds with `npm run db:generate && turbo run build --filter=@genie/landing`.
Because the landing app depends on `@genie/api`, turbo first bundles the Hono API (`apps/api` →
`dist/vercel.mjs`), then `next build` serves it from `src/app/v1/[[...route]]/route.ts`.

How the three surfaces share one app (`apps/landing/src/middleware.ts`):

- **Public host** (anything not in `ADMIN_HOSTS`): `/`, `/product`, `/team` (static 3D pages in
  `public/site`, see `apps/landing/SITE.md`), `/w/[id]`, `/join`, `/privacy`, `/terms`, `/api/waitlist`,
  and `/v1/*` (the API, which sets its own tight security headers). `/admin/*` is a 404 here.
- **Admin host** (`ADMIN_HOSTS`): every path is rewritten under the internal `/admin` route and signed-out
  visitors are sent to `/login`. Own CSP, `noindex`, and a host-only session cookie.

---

## Environment variables (Settings → Environment Variables, **Production**)

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** URL (`-pooler` host, `?sslmode=require`) | used by the API and the admin portal |
| `DIRECT_URL` | Neon **direct** URL (no `-pooler`) | |
| `JWT_ACCESS_SECRET` | 48+ random bytes | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` — rotating it signs everyone out |
| `JWT_REFRESH_SECRET` | a different 48+ random bytes | |
| `ADMIN_SESSION_SECRET` | 32+ random chars | the admin portal refuses to run in production without it |
| `ADMIN_HOSTS` | `admin.getgenie.gift` | comma-separated hostnames that serve the admin instead of the public site |
| `APP_ENV` | `production` | hardened: no `/console`, no OTP echo |
| `PAYMENTS_PROVIDER` | `mock` | no Anchor account yet (`anchor` + `ANCHOR_KEY` + `ANCHOR_WEBHOOK_SECRET` to enable) |
| `KYC_PROVIDER` | `mock` | |
| `PUSH_PROVIDER` | `log` | no FCM yet |
| `RESEND_API_KEY` | your Resend key | **required** in production — otherwise nobody can verify their email |
| `EMAIL_FROM` | `genie <onboarding@resend.dev>` | Resend's shared sender only delivers to your own address; verify a domain for real users |
| `BLOB_READ_WRITE_TOKEN` | from a Vercel Blob store | connect the store under the project's *Storage* tab |
| `APP_PUBLIC_URL` | `https://www.getgenie.gift` | wishlist + referral links |
| `NEXT_PUBLIC_SITE_URL` | `https://www.getgenie.gift` | drives `robots.txt`, `sitemap.xml`, OG tags |
| `NEXT_PUBLIC_API_BASE_URL` | `https://www.getgenie.gift` | the site calls the API on its own origin; `NEXT_PUBLIC_*` values are baked in at build, so **redeploy** after changing |
| `CORS_ORIGINS` | *(leave unset)* | defaults to the site, admin and landing `vercel.app` origins; the mobile app sends no Origin and is unaffected |
| `OTP_ECHO_EMAILS` | *(optional)* `you@x.com,tester@y.com` | echoes the OTP **only** for these exact addresses, even in production — for a tiny closed beta before Resend has a verified domain |

> **Do not set `OTP_DEBUG_ECHO` anywhere internet-reachable.** It echoes every OTP to the caller, which
> turns "forgot password" into an account takeover. It exists for a local, offline dev machine only.

`NODE_ENV` is set to `production` by Vercel — don't add it. Environment variables only apply to **new**
deployments, so redeploy after adding or changing any.

## Domains (Settings → Domains)

`www.getgenie.gift` (primary), `getgenie.gift` (redirects to www) and `admin.getgenie.gift`. DNS lives at
the registrar (Namecheap): `www` and `admin` are CNAMEs to `cname.vercel-dns.com`, the apex is an A record
Vercel shows you.

## Resend (so signup OTPs actually arrive)

On a hardened deploy (`APP_ENV=production`) the OTP is never echoed. Set up Resend, or list a couple of
tester addresses in `OTP_ECHO_EMAILS`, so email verification and password reset can complete.

1. Sign up at <https://resend.com> (free: 100/day), **API Keys → Create** → `RESEND_API_KEY`.
2. Without a verified domain you can only send to the address you signed up with. Use
   `EMAIL_FROM=genie <onboarding@resend.dev>`.
3. To send to anyone: **Domains → Add** your domain, add the DNS records, then
   `EMAIL_FROM=genie <no-reply@yourdomain>`.

## Verify a deploy

```bash
curl https://www.getgenie.gift/v1/health
# {"data":{"status":"ok","env":"production","db":"up",...}}
```

- `https://www.getgenie.gift/` serves the 3D home page; `/admin` is a 404.
- `https://admin.getgenie.gift/` redirects to `/login`; after signing in the dashboard renders.
- Submit the waitlist form and confirm a `WaitlistSignup` row (`npm run db:studio`).

## Point the mobile app at it

- Repo **Settings → Secrets and variables → Actions → Variables**: `API_BASE_URL` = `https://www.getgenie.gift`.
- `.vscode/launch.json` and `apps/mobile/lib/core/env.dart` default to it too. **Rebuild the app** — builds made
  before the API moved still point at the retired `genie-app-and-web-api.vercel.app`.

## First admin

From `packages/db` on a laptop:

```bash
node --env-file=../../.env scripts/create-admin.mjs --email you@example.com --name "You" --role SUPER_ADMIN
```

After that, add people from the portal's **Team** page.

## Local development

```bash
npm run dev --workspace @genie/api        # API on http://localhost:8787 (tsx watch, with the /console test UI)
npm run dev --workspace @genie/landing    # site on http://localhost:3000, admin on http://admin.localhost:3000
```

Put `DATABASE_URL`, `DIRECT_URL`, `ADMIN_SESSION_SECRET` (and the JWT secrets if you want `/v1` served by the
landing app locally) in `apps/landing/.env.local` — see `.env.local.example`. By default the site talks to the
standalone API on `:8787` (`NEXT_PUBLIC_API_BASE_URL`).

## Going back to a separate API project

`apps/api/vercel.json` and `apps/api/api/index.ts` still describe a standalone API deployment (Root Directory
`apps/api`). It isn't used now, but it's the way to split the API out again if it ever needs its own scaling,
limits or domain: create a project from `apps/api`, set the same variables, and point `NEXT_PUBLIC_API_BASE_URL`
and the mobile `API_BASE_URL` at it.
