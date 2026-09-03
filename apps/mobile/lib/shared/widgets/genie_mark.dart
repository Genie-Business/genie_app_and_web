import 'package:flutter/material.dart';

import '../../theme/genie_theme.dart';

/// The genie glyph from the official mark (packages/config/brand/LOGO.png),
/// tinted to [color]. Pairs with the "genie" wordmark.
class GenieMark extends StatelessWidget {
  const GenieMark({super.key, this.size = 24, this.color = GenieColors.primary});

  /// Rendered height in logical pixels. The glyph is taller than it is wide.
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return ColorFiltered(
      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
      child: Image.asset(
        'assets/brand/genie-glyph-white.png',
        height: size,
        filterQuality: FilterQuality.medium,
        isAntiAlias: true,
      ),
    );
  }
}

/// The full "genie" lockup (glyph + wordmark) tinted to [color].
class GenieLogo extends StatelessWidget {
  const GenieLogo({super.key, this.height = 22, this.color = GenieColors.primary});
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return ColorFiltered(
      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
      child: Image.asset(
        'assets/brand/genie-logo-white.png',
        height: height,
        filterQuality: FilterQuality.medium,
        isAntiAlias: true,
      ),
    );
  }
}
