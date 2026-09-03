# genie brand

The official logo, supplied by the design team.

| file | use |
|---|---|
| `LOGO.png` | source — full lockup, brand cyan on transparent, 720×720 |
| `LOGO-WHITE.png` | source — white lockup for dark backgrounds |
| `Logo-1.png` | source — tight lockup crop |
| `genie-logo-violet.png` | the mark recoloured to brand violet `#6D28D9` (692×200) |
| `genie-logo-white.png` | white lockup, tight crop — used as a CSS/tint mask |
| `genie-logo.svg` | the violet mark wrapped as an SVG (embedded raster) |

## Where it's wired

- **Landing** (`apps/landing`): `src/components/Logo.tsx` paints
  `public/genie-logo-mask.png` as a CSS mask filled with
  `var(--genie-primary-solid)`, so it tracks the light/dark theme. App icons
  are `src/app/icon.png` + `src/app/apple-icon.png` (white glyph on a violet
  rounded square).
- **Mobile** (`apps/mobile`): `assets/brand/genie-logo-white.png` /
  `genie-glyph-white.png`, tinted at runtime by `GenieLogo` / `GenieMark`
  (`lib/shared/widgets/genie_mark.dart`).

Regenerate the derived assets with the recolour step in the commit that added
them (Pillow: keep alpha, set RGB to the target colour).

Brand colour: **Deep Violet `#6D28D9`** (`brand.primary[500]` in
`packages/config/src/design-tokens.ts`).
