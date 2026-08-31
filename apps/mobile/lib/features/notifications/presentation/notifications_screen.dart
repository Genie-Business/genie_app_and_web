import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../notifications_repository.dart';

const _icons = {
  'GIFT': Icons.card_giftcard,
  'EVENT': Icons.event,
  'FRIEND': Icons.people_alt_outlined,
  'PAYMENT': Icons.account_balance_wallet_outlined,
  'MESSAGE': Icons.chat_bubble_outline,
  'SYSTEM': Icons.notifications_none,
};

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notes = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: () async {
              await ref.read(notificationsRepositoryProvider).markAllRead();
              ref.invalidate(notificationsProvider);
              ref.invalidate(unreadCountProvider);
            },
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: AsyncView<List<AppNotification>>(
        value: notes,
        onRefresh: () async {
          ref.invalidate(unreadCountProvider);
          return ref.refresh(notificationsProvider.future);
        },
        emptyWhen: (l) => l.isEmpty,
        empty: const EmptyState(
          icon: Icons.notifications_none_rounded,
          title: 'Nothing here yet',
          body: 'Gift, event and friend updates will show up here.',
        ),
        data: (list) => ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: list.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (_, i) {
            final n = list[i];
            return ListTile(
              leading: CircleAvatar(
                backgroundColor: n.read ? GenieColors.subtle : GenieColors.primarySoft,
                child: Icon(_icons[n.category] ?? Icons.notifications_none,
                    size: 18, color: GenieColors.primaryDark),
              ),
              title: Text(n.title,
                  style: TextStyle(fontWeight: n.read ? FontWeight.w400 : FontWeight.w700)),
              subtitle: Text(n.body),
              trailing: Text(relativeDay(n.createdAt),
                  style: const TextStyle(fontSize: 11, color: GenieColors.inkMuted)),
            );
          },
        ),
      ),
    );
  }
}
