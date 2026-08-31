import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../notifications_repository.dart';

class NotificationSettingsScreen extends ConsumerWidget {
  const NotificationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(notificationPrefsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: AsyncView<List<NotificationPref>>(
        value: prefs,
        onRefresh: () => ref.refresh(notificationPrefsProvider.future),
        data: (list) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text('In-app alerts are always on. Choose what also reaches you by push and email.',
                  style: TextStyle(color: GenieColors.inkSecondary, height: 1.4)),
            ),
            for (final p in list) _PrefRow(pref: p),
          ],
        ),
      ),
    );
  }
}

class _PrefRow extends ConsumerStatefulWidget {
  const _PrefRow({required this.pref});
  final NotificationPref pref;

  @override
  ConsumerState<_PrefRow> createState() => _PrefRowState();
}

class _PrefRowState extends ConsumerState<_PrefRow> {
  late bool _push = widget.pref.push;
  late bool _email = widget.pref.email;
  bool _busy = false;

  Future<void> _update({bool? push, bool? email}) async {
    final prevPush = _push;
    final prevEmail = _email;
    setState(() {
      if (push != null) _push = push;
      if (email != null) _email = email;
      _busy = true;
    });
    try {
      await ref
          .read(notificationsRepositoryProvider)
          .setPreference(widget.pref.category, push: push, email: email);
      ref.invalidate(notificationPrefsProvider);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _push = prevPush;
          _email = prevEmail;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.pref.label,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            SwitchListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: const Text('Push'),
              value: _push,
              onChanged: _busy ? null : (v) => _update(push: v),
            ),
            SwitchListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: const Text('Email'),
              value: _email,
              onChanged: _busy ? null : (v) => _update(email: v),
            ),
          ],
        ),
      ),
    );
  }
}
