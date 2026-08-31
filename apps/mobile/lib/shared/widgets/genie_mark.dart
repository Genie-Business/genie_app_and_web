import 'package:flutter/material.dart';

import '../../theme/genie_theme.dart';

/// The genie-in-a-lamp glyph, drawn in one flat colour so it can be tinted to
/// match the brand (deep violet #6D28D9) anywhere it appears. Pairs with the
/// "genie" wordmark.
class GenieMark extends StatelessWidget {
  const GenieMark({super.key, this.size = 24, this.color = GenieColors.primary});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => CustomPaint(
        size: Size.square(size),
        painter: _GenieMarkPainter(color),
      );
}

class _GenieMarkPainter extends CustomPainter {
  _GenieMarkPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final p = Paint()
      ..color = color
      ..isAntiAlias = true;

    // Lamp body — a rounded vessel sitting on the baseline.
    final body = Path()
      ..moveTo(s * 0.12, s * 0.72)
      ..quadraticBezierTo(s * 0.10, s * 0.52, s * 0.34, s * 0.48)
      ..lineTo(s * 0.66, s * 0.48)
      ..quadraticBezierTo(s * 0.90, s * 0.52, s * 0.88, s * 0.72)
      ..quadraticBezierTo(s * 0.88, s * 0.86, s * 0.50, s * 0.86)
      ..quadraticBezierTo(s * 0.12, s * 0.86, s * 0.12, s * 0.72)
      ..close();
    canvas.drawPath(body, p);

    // Spout on the left.
    final spout = Path()
      ..moveTo(s * 0.14, s * 0.60)
      ..lineTo(s * 0.00, s * 0.64)
      ..lineTo(s * 0.14, s * 0.70)
      ..close();
    canvas.drawPath(spout, p);

    // Rising wisp of smoke curling to the flame.
    final wisp = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * 0.085
      ..strokeCap = StrokeCap.round
      ..isAntiAlias = true;
    final curl = Path()
      ..moveTo(s * 0.50, s * 0.46)
      ..cubicTo(s * 0.30, s * 0.36, s * 0.68, s * 0.24, s * 0.50, s * 0.16)
      ..cubicTo(s * 0.40, s * 0.11, s * 0.44, s * 0.05, s * 0.52, s * 0.04);
    canvas.drawPath(curl, wisp);

    // The wish — a small four-point star at the top of the wisp.
    final c = Offset(s * 0.60, s * 0.10);
    final r = s * 0.11;
    final star = Path()
      ..moveTo(c.dx, c.dy - r)
      ..quadraticBezierTo(c.dx + r * 0.28, c.dy - r * 0.28, c.dx + r, c.dy)
      ..quadraticBezierTo(c.dx + r * 0.28, c.dy + r * 0.28, c.dx, c.dy + r)
      ..quadraticBezierTo(c.dx - r * 0.28, c.dy + r * 0.28, c.dx - r, c.dy)
      ..quadraticBezierTo(c.dx - r * 0.28, c.dy - r * 0.28, c.dx, c.dy - r)
      ..close();
    canvas.drawPath(star, p);
  }

  @override
  bool shouldRepaint(_GenieMarkPainter old) => old.color != color;
}
