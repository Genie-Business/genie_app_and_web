# genie platform

Mobile-first social gifting & wishlist product. Celebrants create events with
wishlists of merchant products; friends buy gifts (including anonymous ones);
merchants list, fulfil and get settled. Payments run through **Anchor**.

> This repo is the genie **product**. The GenieApps corporate marketing site is a
> separate project.

## Monorepo layout

| Path | What | Deploys to |
|---|---|---|
| `apps/api` | Hono + TypeScript API | Vercel (functions) |
| `apps/landing` | Next.js consumer landing page + waitlist | Vercel |
| `apps/admin` | Next.js admin portal (M1: login + shell) | Vercel |
| `apps/mobile` | Flutter app | App Store / Play Store |
| `packages/db` | Prisma schema, client, migrations, seed | — |
| `packages/contracts` | Zod request/response schemas (shared) | — |
| `packages/core` | Framework-agnostic domain utils (hashing, OTP, money, ids) | — |
| `packages/config` | Design tokens + shared tsconfig / eslint / tailwind preset | — |

Tooling: **npm workspaces + Turborepo**, Node ≥ 20. (pnpm was the original
plan; npm workspaces was substituted because pnpm wasn't installable in the
scaffolding environment — switch back any time by adding a `pnpm-workspace.yaml`
and `packageManager` field.)

## Milestone 1 status

**Done:** monorepo, full Postgres schema for every epic, and a complete auth
system end-to-end — celebrant + merchant registration, email OTP verification,
login (password + biometric-gated refresh), token rotation, password reset and
change. Plus the landing page, the admin login + dashboard shell, the Flutter
auth flow, and the Anchor payment layer as a provider interface with a working
in-memory mock (wallet ledger, add-funds intent, webhook receiver).

**Stubbed (schema + `501` route + OpenAPI entry):** events, wishlists, carts,
catalog, merchant tools, gifting, orders, real Anchor calls, KYC checks, fees
engine, payouts, referrals, friends, notifications delivery, activities, support,
admin CRUD. See `GET /v1/openapi.json` (`x-genie-status: planned`).

## Quick start

```bash
npm install
cp .env.example .env          # then fill DATABASE_URL / DIRECT_URL from Neon
npm run db:generate
npm run db:migrate            # creates the schema
npm run db:seed               # categories, fees, admin user (prints its password)
npm run dev                   # api :8787 · landing :3000 · admin :3001
```

No local Postgres? Create a free database at https://neon.tech and paste both
connection strings into `.env`. Docker Postgres also works.

### Per-app

```bash
npm run dev   --workspace @genie/api        # http://localhost:8787/v1/health
npm run dev   --workspace @genie/landing    # http://localhost:3000
npm run dev   --workspace @genie/admin      # http://localhost:3001
npm run openapi                             # writes apps/api/openapi.json
```

Flutter app: see [`apps/mobile/README.md`](apps/mobile/README.md).

## Verify the auth flow

```bash
# 1. register (OTP is printed to the API console in dev)
curl -sX POST localhost:8787/v1/auth/register -H 'content-type: application/json' \
  -d '{"firstName":"Ada","lastName":"Obi","email":"ada@example.com","username":"ada_obi","password":"Abcdef1!","phone":"+2348012345678","stateOfResidence":"Lagos"}'

# 2. verify (use the code from the console)
curl -sX POST localhost:8787/v1/auth/verify-email -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","code":"123456","deviceId":"curl-device-1"}'

# 3. call an authed route
curl -s localhost:8787/v1/me -H "authorization: Bearer <accessToken>"
```

### Payments (mock)

```bash
# create a top-up intent (needs a verified session)
curl -sX POST localhost:8787/v1/payments/add-funds -H "authorization: Bearer <token>" \
  -H 'content-type: application/json' -d '{"amountKobo":500000}'
# simulate the bank transfer landing
curl -sX POST localhost:8787/v1/payments/_mock/settle -H 'content-type: application/json' \
  -d '{"reference":"<reference from previous response>"}'
# balance is now credited
curl -s localhost:8787/v1/payments/wallet -H "authorization: Bearer <token>"
```

## Tests

```bash
npm run test                 # core (pure) + contracts + api (integration; needs DATABASE_URL)
```

API integration suites auto-skip when `DATABASE_URL` is unset/unreachable.

## Deployment

Three Vercel projects, root directories `apps/api`, `apps/landing`, `apps/admin`.
Env vars are listed in `.env.example`; set the same set (minus dev defaults) in
each project. Provision **Neon** Postgres and **Vercel Blob**. Point the mobile
app's `API_BASE_URL` at the deployed API. Enable Anchor by setting
`PAYMENTS_PROVIDER=anchor` + `ANCHOR_KEY` + `ANCHOR_WEBHOOK_SECRET`.
