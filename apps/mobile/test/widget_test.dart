import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:genie/app/app.dart';

// Also keeps `flutter create` from generating its `MyApp` boilerplate test.
void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('app boots to a MaterialApp', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: GenieApp()));
    expect(find.byType(MaterialApp), findsOneWidget);
    // Let the (plugin-less) bootstrap microtasks settle for a clean teardown.
    await tester.pump(const Duration(milliseconds: 50));
  });
}
