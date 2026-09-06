# genie — end-to-end test report

_Run 2026-09-06 against the live deploys_
`genie-app-and-web-api.vercel.app` · `genie-app-and-web-landing.vercel.app`

## Automated suites

| Suite | Result |
|---|---|
| `flutter analyze` (apps/mobile) | ✅ No issues found |
| `flutter test` (apps/mobile) | ✅ 11/11 pass (deep links, validators, widget boot) |
| `vitest run` (apps/api) | ✅ 6 pass · 90 skipped — integration suites need a disposable test DB (`DATABASE_URL` containing "test"); they refuse to run against the shared Neon DB by design |
| `tsc --noEmit` (apps/api) | ✅ clean |

## Live journeys — all passing

### Celebrant
- register → email OTP verify → login → **token refresh + rotation + reuse-detection** (replaying a rotated refresh token revokes every session: _"Your session was ended for security"_)
- create a **ONE_OFF** event and an **ANNUAL** (recurring) event
- **list events → both appear** — the "I can't see events I created" bug is fixed
- events dashboard, event detail, fulfilment %
- create wishlist → browse catalog → add items → share link (the "≥ 2 items to share" rule is enforced)
- public wishlist view: celebrant shown as **"Ada O."** (first name + last initial), **no delivery address** in the payload
- gifts received, wallet, gift invitations, activity feed, notifications + preferences, KYC requirements/status, messages, support threads

### Guest checkout (web `/w/<id>`)
- per-item **Buy now** + **Buy all**
- checkout form → virtual account issued → **Simulate payment** → gift lands, wishlist fulfilment updates, celebrant sees it in "gifts received"
- **anonymous** ("keep it a surprise") → gifter hidden from the celebrant (`from: null`) until reveal — verified with a real checkbox click
- "Open in app" deep-link banner present; `assetlinks.json` + `apple-app-site-association` served

### Authenticated gifter (2nd account)
- add funds → mock settle → wallet credited exactly
- gift **quote** (full fee breakdown) → **pay from wallet** → exact debit, `Order` created, gift `PAID`
- friend request → accept → friends list correct both directions
- gift cart: add / view / **over-fulfilled guard**; a clean cart (fresh item only) checks out → `PAID`, wallet debited
- one-time username change

### Merchant
- register with invite code → verify → login
- create a product → shows up in the public catalog
- receives the gift order with correct money math (5% commission, `proceedsKobo` = subtotal − commission)
- delivery status `PENDING → DISPATCHED → DELIVERED`
- merchant wallet credited with proceeds
- after `DELIVERED`, the celebrant can reveal the anonymous gift → gifter name returned

## Issues found

> **All five resolved** in the follow-up commit — see the per-item notes below.

### 1. [Medium] Web checkout understates the price before payment — ✅ fixed
`apps/landing/src/components/WishlistCheckout.tsx`
- line 287: `{formatKobo(chosenTotal)} total, including delivery and fees.` — `chosenTotal` (line 270) is **only the item subtotal**
- line 313: `Continue to payment · {chosenTotal}` — same
- line 161: `Buy all · {allTotal}` — same

The real charge adds **1.5% transaction fee + ₦1,500 logistics per item**. Observed: an item labelled _"₦3,500 total, including delivery and fees"_ → the payment step correctly asks **₦5,052.50**. On "Buy all" the gap grows with item count (₦1,500 × lines).

_Fixed:_ new `POST /v1/public/wishlists/{id}/quote` returns the real fee-inclusive
total (shares the checkout pricing loop, no side effects). `WishlistCheckout.tsx`
fetches it when the dialog opens and shows the exact amount on both the summary
line and the "Continue to payment" button; the list buttons now read
"Buy all · ₦X + fees". Verified: dialog and pay-step amounts now agree (₦6,067.50).

### 2. [Low] `POST /v1/cart/checkout` fails the whole cart if any one line is stale — ✅ fixed
`apps/api/src/modules/gifts/gifts.service.ts` (cart checkout path)
If one cart line was fully gifted by someone else after it was added, checkout returns `over_fulfilled` ("Only 0 of this item still need a gift") and blocks the **entire** cart, including valid lines. The message doesn't name the offending item.
_Fixed:_ `payForCart` now prices with a non-throwing giftability check — un-giftable
lines are dropped into a `skipped[]` list, the rest are paid, and `cart.checkout`
removes the skipped lines from the cart. If nothing is left it returns
`409 nothing_giftable` naming each item and empties the cart. Verified both paths.

### 3. [Low] Anonymous gifts can be revealed before delivery — ✅ fixed
`reveal()` had no delivery-status check, yet the app promises the gifter
("Revealed only when the gift arrives"). _Fixed:_ `giftHasArrived()` gates both
`canReveal` and `reveal()` — a gift is revealable once its order is `DELIVERED`,
or immediately for `PICKUP` items (no delivery leg). Verified: `canReveal` false
and reveal → 400 before delivery; true and → 200 after.

### 4. [Low] OpenAPI spec documents two routes at the wrong path — ✅ fixed
`registerPath` calls used mount-absolute paths, so the spec said
`/v1/kyc/kyc/level-1` and `/v1/payments/payments/webhooks/anchor`. _Fixed:_ paths
made router-relative; `openapi.json` regenerated — now `/v1/kyc/level-1` and
`/v1/payments/webhooks/anchor`.

### 5. [Info] Dead duplicate contract — ✅ removed
`payForGiftBody` in `packages/contracts/src/payments.ts` (amountKobo-based, unused)
deleted; the live quantity-based one in `gifts.ts` is the only definition now.

## Known limitations (pre-existing, not defects)
- `apple-app-site-association` ships `appID: "TEAMID.co.genieapps.genie"` — iOS Universal Links need the real `APPLE_TEAM_ID`
- `assetlinks.json` carries the **debug** signing cert SHA-256 — add the release fingerprint when release signing is set up
- `PAYMENTS_PROVIDER=mock` — real bank transfers need Anchor keys; `_simulate` / `_mock/settle` cover testing
- `GET /v1/payouts` returns `[]` — merchant settlement scheduler is a later milestone
