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
- **Mobile app icon** — white genie glyph on `#6D28D9`. Sources live in
  `apps/mobile/assets/icon/` (`icon-foreground.png` adaptive/monochrome layer,
  `icon-android.png` rounded legacy fallback, `icon-ios.png` full-bleed square);
  `dart run flutter_launcher_icons` (config in `apps/mobile/pubspec.yaml`)
  writes the Android mipmaps/adaptive XML (committed) and the iOS icon set
  (`ios/` is regenerated and gitignored, so re-run it after `flutter create`).
  The Android launch screen (`drawable/launch_background.xml` +
  `values-v31/styles.xml`) and the Flutter `_SplashScreen` use the same violet
  and glyph.

The glyph in `LOGO.png` is only ~116×180px, so the hi-res glyph renders
(app icon, in-app `genie-glyph-*.png`, launch glyph) are produced by upscaling
the antialiased alpha, smoothing, thresholding at 8× and box-downsampling —
the shape is flat single-colour, so edges stay clean at any size.

Regenerate the derived assets with the recolour step in the commit that added
them (Pillow: keep alpha, set RGB to the target colour).

Brand colour: **Deep Violet `#6D28D9`** (`brand.primary[500]` in
`packages/config/src/design-tokens.ts`).
