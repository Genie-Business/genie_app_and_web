# genie — Security review & hardening

_2026-09-02 · authorised assessment of the genie API, landing site, admin portal and Flutter app_

Scope: the deployed API (`genie-app-and-web-api.vercel.app`), the landing and admin
Next.js apps, and the mobile client. Method: source review of every module plus
active testing of the live API (IDOR, auth bypass, JWT tampering, rate-limit
bypass, injection, mass assignment, amount tampering, enumeration).

## Verdict

The core authorisation model is sound — **no IDOR was found** (a user cannot read
or change another user's events, wishlists, gifts, messages or orders), JWT
verification is solid, and Prisma parameterises every query so there is no SQL
injection surface. The gaps were around configuration, transport hardening,
brute-force protection and one dangerous debug convenience that had been left on.

"Impenetrable" is not a state any system reaches — but the exploitable holes are
closed and the remaining surface is small and monitored.

---

## Findings

### CRITICAL — fixed in code, needs a config change to fully close

**1. Account takeover via echoed password-reset code**

`otpEchoEnabled()` returned true for any `APP_ENV` other than `production`. The
live API runs `APP_ENV=preview`, so:

```
POST /v1/auth/password/forgot {"email":"victim@…"}
  → 200 {"verificationCode":"794172"}          ← the reset code, handed to the caller
POST /v1/auth/password/reset  {"email":"victim@…","code":"794172","newPassword":"…"}
  → 200 "Your password has been reset."
```

Confirmed working against the live API against a freshly-created victim account —
one unauthenticated request away from full takeover of any account whose email
you know.

**Fix:** the code is now echoed only when
- `APP_ENV=local` (a developer's own machine), or
- `OTP_DEBUG_ECHO=true` **and** `APP_ENV≠production` (an explicit opt-in on a
  throwaway env), or
- the caller's own address is listed in `OTP_ECHO_EMAILS` (matches through
  `+tag` aliases; cannot be aimed at someone else).

After the deploy this is already off on `preview`. **Action:** set
`APP_ENV=production` on the API project, and `OTP_ECHO_EMAILS=<your test address>`
so your own testing still pre-fills the code.

---

### HIGH — fixed in code

**2. No security headers; CORS wide open**

The API sent no `Strict-Transport-Security`, `X-Frame-Options`,
`X-Content-Type-Options`, `Content-Security-Policy` or `Referrer-Policy`, and
`Access-Control-Allow-Origin: *` for every origin including `https://evil.example`.

**Fix:** `hono/secureHeaders` on every response (HSTS preload, frame-deny,
nosniff, `no-referrer`, `default-src 'none'` CSP, COOP/CORP). CORS now reflects
only the landing + admin origins (`CORS_ORIGINS`, env-overridable). The mobile
app sends no `Origin` and is unaffected. Landing + admin also gained a CSP and
HSTS via `next.config`.

**3. Rate limiting did nothing in production**

The limiter was an in-memory `Map` per function instance. Vercel runs many
short-lived instances, so login/OTP/registration brute-force was effectively
unlimited (a cold start = a fresh empty map).

**Fix:** a shared Postgres fixed-window counter (`RateLimit` table, atomic
upsert per check, in-memory fallback if the DB is briefly unreachable). Added an
IP-wide login limiter (identifier spray) on top of the per-identifier one, and
rate-limited the admin login (which had none).

**4. `/console` testing UI served on the deployed API**

`GET /console` returned 200 and `/` redirected to it. It is a full
attack-surface UI. Now registered only when `APP_ENV=local`; `/` redirects to
`/v1/health` everywhere else.

**5. Wallet ledger could be overdrawn by concurrent payments**

`postEntry` read the wallet balance, then wrote it back, with no lock. Two
parallel gift payments could both see the pre-spend balance and both succeed,
overdrawing the wallet (a double-spend).

**Fix:** `postEntry` now takes `SELECT … FOR UPDATE` on the wallet row and
re-checks balance and idempotency under the lock, inside the same transaction as
the ledger write.

**6. Refresh-token reuse was a bare 401**

A stolen-and-rotated refresh token presented again just failed. Now it revokes
every live session for that user (assumes the token was captured).

---

### MEDIUM — fixed in code

| # | Issue | Fix |
|---|---|---|
| 7 | Public wishlist view (no auth, link forwards freely) exposed the celebrant's **home delivery address** and full name | address removed entirely; name reduced to "First L." |
| 8 | JWT verification didn't pin the algorithm | `algorithms: ['HS256']` + `maxTokenAge`; admin session JWT too |
| 9 | Rate-limit key trusted the caller-settable first hop of `x-forwarded-for` | now prefers Vercel's `x-vercel-forwarded-for` / `x-real-ip` (platform-set, unspoofable) |
| 10 | No upper bound on money amounts (`add-funds 10^18` was accepted) | top-up ≤ ₦2,000,000, gift ≤ ₦20,000,000, withdrawal ≤ ₦5,000,000, product price ≤ ₦10,000,000 |
| 11 | No password length cap (scrypt CPU-DoS) | ≤ 200 chars |
| 12 | Product image URLs accepted any scheme | must be `https://` |
| 13 | `x-request-id` reflected/logged unbounded | clamped to `[A-Za-z0-9._-]{1,64}` |
| 14 | Admin fell back to a hard-coded session secret if the env var was missing | refuses to boot in production without `ADMIN_SESSION_SECRET` (32+ chars) |
| 15 | `X-Powered-By` fingerprint on Next apps | `poweredByHeader: false` |

---

### Tested and found OK (no change needed)

- **IDOR** — attacker → victim's event / wishlist / wishlist-items / message
  thread / gift reveal all return 404. Ownership is checked on every path.
- **JWT** — `alg:none` → 403; tampered payload + reused signature → 401; HS256
  with empty / common / the admin fallback secret → 401.
- **Mass assignment** — extra `role`, `status`, `emailVerifiedAt` keys on
  register are stripped by Zod and never reach Prisma (services map fields
  explicitly, never spread the raw body).
- **Injection** — the only raw SQL is a static `SELECT 1` health probe;
  everything else is Prisma tagged-template parameterised. Rate-limit and wallet
  lock raw queries use `${}` interpolation which Prisma parameterises.
- **Enumeration** — login, forgot-password and resend give uniform responses
  whether or not the account exists; login uses a dummy hash for constant-ish
  timing.
- **Negative amounts** — rejected (`add-funds -100000` → 400).
- **Stored XSS** — support / DM / wishlist-note text is rendered as escaped
  React text or Flutter `Text`, never as HTML.

---

## What you need to do

1. **Apply the migration** (adds the shared rate-limit table):
   ```
   npm run migrate:deploy --workspace @genie/db
   ```
   Until it runs, rate limiting silently falls back to the old per-instance
   behaviour — degraded, not broken.

2. **On the API's Vercel project**, set:
   - `APP_ENV` → `production`
   - `OTP_ECHO_EMAILS` → your test address(es), comma-separated, so your own
     signup/reset testing still pre-fills the code. **Never a real user's address.**
   - `CORS_ORIGINS` → leave unset (the default is correct) unless you add a new
     web origin.

3. **On the admin's Vercel project**, confirm `ADMIN_SESSION_SECRET` is set to a
   32+ character random string (the app now refuses to start without it in prod).

4. **Recommended, not blocking:** verify the `genieapps.co` domain in Resend so
   real users (not just allow-listed testers) can receive verification emails.

---

## Still worth doing later

- **Anchor / real payments** will need webhook-signature verification hardening,
  idempotency review, and a reconciliation job (the ledger-consistency check
  already exists — schedule it).
- **KYC uploads** are type/size checked but not magic-byte sniffed; low risk
  while blobs are never served as HTML.
- **CSP on the web apps uses `'unsafe-inline'`** for scripts (Next hydration).
  A nonce-based CSP via middleware would close reflected-XSS entirely.
- **2FA for the admin portal**, and an `AuditLog` review UI.
- **A WAF / bot layer** (Vercel's, or Cloudflare in front) for volumetric
  attacks — application-level rate limiting handles credential attacks, not
  floods.
