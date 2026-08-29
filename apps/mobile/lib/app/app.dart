import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/auth_controller.dart';
import '../theme/genie_theme.dart';
import 'router.dart';

class GenieApp extends ConsumerStatefulWidget {
  const GenieApp({super.key});

  @override
  ConsumerState<GenieApp> createState() => _GenieAppState();
}

class _GenieAppState extends ConsumerState<GenieApp> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authControllerProvider.notifier).bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'genie',
      debugShowCheckedModeBanner: false,
      theme: GenieTheme.light,
      routerConfig: router,
    );
  }
}
