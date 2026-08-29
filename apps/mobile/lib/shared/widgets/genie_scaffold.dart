import 'package:flutter/material.dart';

import '../../theme/genie_theme.dart';

/// A form-friendly scaffold: title, optional subtitle, scrollable body, and a
/// pinned primary action at the bottom.
class GenieFormScaffold extends StatelessWidget {
  const GenieFormScaffold({
    super.key,
    required this.title,
    required this.children,
    this.subtitle,
    this.primaryAction,
    this.showBack = true,
  });

  final String title;
  final String? subtitle;
  final List<Widget> children;
  final Widget? primaryAction;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(automaticallyImplyLeading: showBack),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: GenieTheme.display(26)),
                    if (subtitle != null) ...[
                      const SizedBox(height: 8),
                      Text(subtitle!,
                          style: const TextStyle(color: GenieColors.inkSecondary, height: 1.4)),
                    ],
                    const SizedBox(height: 24),
                    ...children,
                  ],
                ),
              ),
            ),
            if (primaryAction != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
                child: primaryAction,
              ),
          ],
        ),
      ),
    );
  }
}

class GenieErrorText extends StatelessWidget {
  const GenieErrorText(this.message, {super.key});
  final String? message;

  @override
  Widget build(BuildContext context) {
    if (message == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0x14E5484D),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(message!, style: const TextStyle(color: GenieColors.error, fontSize: 13)),
      ),
    );
  }
}
