import 'package:flutter/material.dart';

import '../../theme/genie_theme.dart';

/// The genie glyph — a seated genie (hair knot, head, ponytail, folded arms,
/// a curl of smoke), one flat colour so it tints to the brand violet anywhere
/// it appears. Pairs with the "genie" wordmark. Mirrors
/// packages/config/brand/genie-logo.svg.
class GenieMark extends StatelessWidget {
  const GenieMark({super.key, this.size = 24, this.color = GenieColors.primary});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => CustomPaint(
        size: Size(size * 34 / 44, size),
        painter: _GenieMarkPainter(color),
      );
}

class _GenieMarkPainter extends CustomPainter {
  _GenieMarkPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    // Design space is 34 x 44 (matches the SVG viewBox).
    final sx = size.width / 34;
    final sy = size.height / 44;
    canvas.scale(sx, sy);

    final p = Paint()
      ..color = color
      ..isAntiAlias = true;

    // hair knot
    canvas.drawCircle(const Offset(16.4, 4.8), 2.6, p);
    // head
    canvas.drawOval(
      Rect.fromCenter(center: const Offset(16.4, 14), width: 16.8, height: 14),
      p,
    );
    // ponytail
    final ponytail = Path()
      ..moveTo(24.2, 11)
      ..cubicTo(27.2, 10.5, 29.2, 12, 29.6, 14.4)
      ..cubicTo(29.9, 16.3, 29, 18, 27.6, 18.6)
      ..cubicTo(27.4, 15.2, 26.1, 12.7, 24.2, 11)
      ..close();
    canvas.drawPath(ponytail, p);
    // folded arms / body
    final body = Path()
      ..moveTo(16.4, 19.6)
      ..cubicTo(9.7, 19.6, 5.4, 22.6, 5.4, 26.5)
      ..cubicTo(5.4, 29.9, 8.7, 31.9, 13.4, 32.4)
      ..lineTo(11.7, 37.5)
      ..cubicTo(11.4, 38.4, 12.5, 39.1, 13.2, 38.5)
      ..lineTo(17.8, 34.6)
      ..cubicTo(18.2, 34.6, 18.6, 34.7, 19.0, 34.7)
      ..cubicTo(25.7, 34.7, 30.0, 31.7, 30.0, 27.8)
      ..cubicTo(30.0, 23.9, 25.7, 20.9, 19.0, 20.9)
      ..close();
    canvas.drawPath(body, p);
    // curl of smoke
    final wisp = Path()
      ..moveTo(8.2, 33.4)
      ..cubicTo(4.8, 34, 2.2, 32.8, 1.6, 30.4)
      ..cubicTo(1.2, 28.6, 2.0, 26.8, 3.5, 26.1)
      ..cubicTo(2.5, 28.6, 3.5, 30.7, 5.9, 31.5)
      ..cubicTo(7.1, 31.9, 7.9, 32.3, 8.2, 33.4)
      ..close();
    canvas.drawPath(wisp, p);
  }

  @override
  bool shouldRepaint(_GenieMarkPainter old) => old.color != color;
}
