import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/deep_links.dart';
import '../features/auth/auth_controller.dart';
import '../theme/genie_theme.dart';
import 'router.dart';

class GenieApp extends ConsumerStatefulWidget {
  const GenieApp({super.key});

  @override
  ConsumerState<GenieApp> createState() => _GenieAppState();
}

class _GenieAppState extends ConsumerState<GenieApp> {
  DeepLinkService? _deepLinks;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await ref.read(authControllerProvider.notifier).bootstrap();
      _deepLinks = DeepLinkService(ref.read(routerProvider))..start();
    });
  }

  @override
  void dispose() {
    _deepLinks?.dispose();
    super.dispose();
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
