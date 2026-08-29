import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Mirrors packages/config/src/design-tokens.ts. The primary cyan is the genie
/// logo colour (provisional #33B6CE — resample from the official asset and
/// update here + the TS tokens together).
class GenieColors {
  static const primary = Color(0xFF33B6CE);
  static const primaryDark = Color(0xFF2A93A8);
  static const primarySoft = Color(0xFFECF8FB);
  static const accent = Color(0xFFEE9B12);

  static const ink = Color(0xFF0F2E36);
  static const inkSecondary = Color(0xFF526168);
  static const inkMuted = Color(0xFF6E7F86);

  static const canvas = Color(0xFFFBFDFE);
  static const surface = Color(0xFFFFFFFF);
  static const subtle = Color(0xFFF1F5F7);
  static const border = Color(0xFFE2E9EC);

  static const success = Color(0xFF16A46B);
  static const error = Color(0xFFE5484D);
}

class GenieTheme {
  static ThemeData get light {
    final base = ThemeData.light(useMaterial3: true);
    final scheme = ColorScheme.fromSeed(seedColor: GenieColors.primary).copyWith(
      primary: GenieColors.primary,
      surface: GenieColors.surface,
    );
    return base.copyWith(
      colorScheme: scheme,
      scaffoldBackgroundColor: GenieColors.canvas,
      textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
        bodyColor: GenieColors.ink,
        displayColor: GenieColors.ink,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: GenieColors.canvas,
        foregroundColor: GenieColors.ink,
        elevation: 0,
        centerTitle: false,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: GenieColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: GenieColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: GenieColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: GenieColors.primary, width: 2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: GenieColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
          textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
    );
  }

  static TextStyle display(double size) =>
      GoogleFonts.unbounded(fontWeight: FontWeight.w700, fontSize: size, color: GenieColors.ink);
}
