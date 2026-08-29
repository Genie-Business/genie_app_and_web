import 'package:flutter/material.dart';

import '../../shared/widgets/genie_scaffold.dart';

/// Settings destinations whose full behaviour lands in a later milestone.
class SettingsPlaceholderScreen extends StatelessWidget {
  const SettingsPlaceholderScreen({super.key, required this.title, required this.body});
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return GenieFormScaffold(
      title: title,
      subtitle: body,
      children: const [
        SizedBox(height: 40),
        Center(child: Chip(label: Text('Coming soon'))),
      ],
    );
  }
}
