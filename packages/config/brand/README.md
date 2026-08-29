# genie brand assets

Drop the official logo files here:

| File | Purpose |
|---|---|
| `genie-logo.svg` | Primary horizontal wordmark (preferred — vector) |
| `genie-logo.png` | Raster fallback, transparent background, ≥ 1024px wide |
| `genie-mark.svg` | The genie-in-a-lamp glyph only (app icon, favicon source) |
| `genie-logo-white.svg` | White/knockout version for dark surfaces |

## Colour

`src/design-tokens.ts` → `brand.primary[500]` is the logo cyan and currently a
**provisional** value (`#33B6CE`). Once `genie-logo.svg` is here, sample the
fill colour and update `brand.primary[500]`; regenerate the ramp so 50–950 stay
consistent (any tint tool or `chroma.scale`).
