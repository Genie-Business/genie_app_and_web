import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Mirrors packages/config/src/design-tokens.ts. The primary is genie deep
/// violet (#6D28D9); keep this in sync with the TS tokens and apps/*/globals.css.
class GenieColors {
  static const primary = Color(0xFF6D28D9);
  static const primaryDark = Color(0xFF5A20B0);
  static const primarySoft = Color(0xFFF4F1FE);
  static const accent = Color(0xFFEE9B12);

  static const ink = Color(0xFF1B1330);
  static const inkSecondary = Color(0xFF544D63);
  static const inkMuted = Color(0xFF716A81);

  static const canvas = Color(0xFFFCFBFE);
  static const surface = Color(0xFFFFFFFF);
  static const subtle = Color(0xFFF3F1F8);
  static const border = Color(0xFFE6E2EE);

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
