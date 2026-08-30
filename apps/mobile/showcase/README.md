# genie — App Store showcase

A self-contained single page showing two iOS screens from the genie app
(sign-up + genie+ membership) on an auto-scaling stage. Used for the store
listing / press / investor decks.

## Build

```bash
node build.mjs
```

`build.mjs` inlines the photos from `assets/` as data URIs, the genie logo
and status-bar icons as SVG, and writes `index.html` (self-contained, ~620 KB).
Fonts (Cormorant Garamond + Inter + Quicksand) load from Google Fonts.

- Edit copy / layout in `template.html`, then rebuild.
- `index.html` is the generated artifact — safe to open directly or host anywhere.

## Assets

`assets/*.jpg` are compressed (sharp, ~1000px wide) crops of the source photos
in the brand asset library. Swap in new ones and update the `dataUri(...)`
calls in `build.mjs`.
