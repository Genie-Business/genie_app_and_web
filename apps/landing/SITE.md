# The marketing site (3D scroll pages)

`/`, `/product` (with the FAQs) and `/team` are **static HTML** in `public/site/`, served at clean
URLs by the rewrites in `next.config.mjs`. A procedural 3D gift (three.js, vendored in
`public/assets/vendor/three/`, so no third-party script origin) floats between sections as you
scroll, and every page ends in a download section. The rest of the app — `/w/[id]` wishlist
pages, `/join`, `/privacy`, `/terms`, the app-link files and `/api/waitlist` — is ordinary Next.js.

```
public/site/index.html      home
public/site/product.html    how it works, features, concierge, sell on genie, FAQs
public/site/team.html       story, values, the teams behind genie
public/assets/
  site.css                  shared styles
  site.js                   shared behaviour — reveals, nav, download buttons, notify forms
  gift.js                   the 3D gift and its scroll-driven flight path
  christmas-gifts.mp4, team.jpg
```

(The older Next pages at `src/app/(site)/page.tsx` and `faq/` are no longer reachable — `/` and
`/faq` are rewritten/redirected to the pages above. Delete them whenever you like.)

## Event photos

The decorative cut-outs are event photos in polaroid-style cards (`.snap`), kept in `public/assets/events/`:
`birthday.jpg`, `celebration.jpg`, `surprise.jpg`, `corporate.jpg` (all ~640px wide JPEGs). Each card is a
`<figure class="snap …"><img …><figcaption>Label</figcaption></figure>` inside a `.flower.snaps--*` wrapper that carries the
scroll parallax (`data-speed` / `data-rot`). To change a photo, drop a new file in that folder and edit the `src`, `alt` and
caption in the page (`public/site/*.html`); `object-position` on the `<img>` controls the crop. There are no wedding or baby
shower photos yet — add `wedding.jpg` / `baby-shower.jpg` and point a card at them.

## Point "Get the app" at the real stores

Everything on the site leads to the **download** section at the bottom of each page. Until the app
is published the store buttons show a **Soon** tag and send people to the notify-me form. When it
is live, paste the links into `STORES` at the top of `public/assets/site.js`:

```js
const STORES = {
  ios: 'https://apps.apple.com/ng/app/genie/id…',
  android: 'https://play.google.com/store/apps/details?id=…',
  apk: '/assets/genie.apk', // optional direct Android download
};
```

## Notify-me form

Posts `{ email, source: 'site-3d:<page>' }` to this app's own `/api/waitlist`, which forwards to
the genie API. Signups land in the admin portal's **Waitlist** page.

## Editing

- Each `<section>` carries `data-fly="x,y,scale,yaw,pitch,roll"` (desktop) and `data-fly-m`
  (mobile) — where the gift sits while that section is on screen (`x`/`y` are fractions of half the
  viewport; negative `y` is lower).
- `data-follow` (0–1) sets how strongly the gift tracks the pointer in that section: it drifts toward
  the cursor, turns to face it and leans into it. Hero and download sections use `1`; card-heavy
  sections use `.3` so it only nudges.
- **Team**: there are no named people yet. When you have names and photos, replace the "teams behind
  every gift" cards in `team.html` with person cards.
- **FAQs** live in `product.html` (and the matching `FAQPage` JSON-LD in `<head>` — keep them in sync).
- Local preview: `npm run dev --workspace @genie/landing`, then open http://localhost:3000.
