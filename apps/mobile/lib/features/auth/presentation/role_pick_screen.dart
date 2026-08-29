import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../theme/genie_theme.dart';

class RolePickScreen extends StatelessWidget {
  const RolePickScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('How will you use genie?', style: GenieTheme.display(24)),
              const SizedBox(height: 24),
              _RoleCard(
                icon: Icons.celebration_rounded,
                title: 'I want to celebrate',
                body: 'Create events, build wishlists and receive gifts.',
                onTap: () => context.go('/auth/sign-up/celebrant'),
              ),
              const SizedBox(height: 16),
              _RoleCard(
                icon: Icons.storefront_rounded,
                title: 'I want to sell',
                body: 'List products and services, and fulfil gift orders.',
                onTap: () => context.go('/auth/sign-up/merchant'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.icon,
    required this.title,
    required this.body,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String body;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          border: Border.all(color: GenieColors.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            Icon(icon, color: GenieColors.primary, size: 32),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text(body, style: const TextStyle(color: GenieColors.inkSecondary, fontSize: 13)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: GenieColors.inkMuted),
          ],
        ),
      ),
    );
  }
}
