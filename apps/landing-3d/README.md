# genie — 3D scroll site

A static, no-build marketing site: **Home**, **Product** (with FAQs) and **Team**.
A procedural 3D gift (three.js) floats between sections as you scroll, and every page
ends in a download section.

```
index.html      home
product.html   how it works, features, concierge, sell on genie, FAQs
team.html       story, values, the teams behind genie
assets/
  site.css      shared styles
  site.js       shared behaviour — reveals, nav, download buttons, notify forms
  gift.js       the 3D gift and its scroll-driven flight path (three.js via CDN)
  christmas-gifts.mp4, team.jpg
vercel.json     /api/waitlist proxy + asset caching
```

## Run it

ES modules and the import map need http, not `file://`:

```bash
npx serve apps/landing-3d
```

(or `python -m http.server 5180` from this folder).

## Point "Get the app" at the real stores

Everything on the site leads to the **download** section at the bottom of each page.
Until the app is published the store buttons show a **Soon** tag and send people to the
notify-me form. When the app is live, paste the links into `STORES` at the top of
[`assets/site.js`](assets/site.js) — the buttons switch to real links on every page:

```js
const STORES = {
  ios: 'https://apps.apple.com/ng/app/genie/id…',
  android: 'https://play.google.com/store/apps/details?id=…',
  apk: '/assets/genie.apk', // optional direct Android download
};
```

## Notify-me form

Posts `{ email, source: 'site-3d:<page>' }` to `/api/waitlist`, which `vercel.json`
rewrites to the genie API (`/v1/waitlist`). If the proxy isn't there (e.g. local
`http.server`) it falls back to calling the API directly, which only works from an origin
in the API's `CORS_ORIGINS` — add the site's domain there before pointing a custom
domain at it. Signups land in the admin dashboard's **Waitlist** page.

## Editing

- The three pages are plain HTML. Each `<section>` carries `data-fly="x,y,scale,yaw,pitch,roll"`
  (desktop) and `data-fly-m` (mobile) — where the gift sits while that section is on screen
  (`x`/`y` are fractions of half the viewport; negative `y` is lower).
- `data-follow` (0–1) on a `<section>` sets how strongly the gift tracks the pointer while that
  section is on screen: it drifts toward the cursor, turns to face it and leans into it. The
  hero and download sections use `1`; card-heavy sections use `.3` so it only nudges.
- **Team**: there are no named people yet. When you have names and photos, replace the
  "teams behind every gift" cards in `team.html` with person cards.
- **FAQs** live in `product.html` (and the matching `FAQPage` JSON-LD in `<head>` — keep them in sync).

## Deploy

Create a Vercel project with **Root Directory** `apps/landing-3d` (framework: Other, no build
command). `vercel.json` handles the rest.
