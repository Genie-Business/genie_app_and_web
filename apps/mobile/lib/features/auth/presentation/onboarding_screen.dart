import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../theme/genie_theme.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _slides = [
    (
      'Wishlists worth sharing',
      'Create an event and fill a wishlist with things you actually want.',
    ),
    (
      'Gifts, made easy',
      "Friends pick from your list and pay in seconds — openly or anonymously.",
    ),
    (
      'A little bit of magic',
      'Anonymous gifts stay secret until they physically reach you.',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (i) => setState(() => _page = i),
                itemCount: _slides.length,
                itemBuilder: (_, i) {
                  final (title, body) = _slides[i];
                  return Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          height: 180,
                          width: 180,
                          decoration: BoxDecoration(
                            color: GenieColors.primarySoft,
                            borderRadius: BorderRadius.circular(40),
                          ),
                          child: const Icon(Icons.card_giftcard_rounded,
                              size: 84, color: GenieColors.primary),
                        ),
                        const SizedBox(height: 40),
                        Text(title, style: GenieTheme.display(28)),
                        const SizedBox(height: 12),
                        Text(body,
                            style: const TextStyle(
                                fontSize: 16, color: GenieColors.inkSecondary, height: 1.5)),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                _slides.length,
                (i) => AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  height: 6,
                  width: i == _page ? 22 : 6,
                  decoration: BoxDecoration(
                    color: i == _page ? GenieColors.primary : GenieColors.border,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  FilledButton(
                    onPressed: () => context.go('/auth/role'),
                    child: const Text('Get started'),
                  ),
                  TextButton(
                    onPressed: () => context.go('/auth/sign-in'),
                    child: const Text('I already have an account'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
