import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../../friends/friends_repository.dart';
import '../messages_repository.dart';

/// The celebrant's direct-message inbox.
class MessagesScreen extends ConsumerWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final threads = ref.watch(messageThreadsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _startChat(context, ref),
        icon: const Icon(Icons.edit_outlined),
        label: const Text('New message'),
      ),
      body: AsyncView<List<MessageThread>>(
        value: threads,
        onRefresh: () async {
          ref.invalidate(messagesUnreadProvider);
          return ref.refresh(messageThreadsProvider.future);
        },
        emptyWhen: (l) => l.isEmpty,
        empty: EmptyState(
          icon: Icons.forum_outlined,
          title: 'No messages yet',
          body: 'Message a friend to plan a gift together.',
          action: FilledButton(
            onPressed: () => _startChat(context, ref),
            child: const Text('Start a conversation'),
          ),
        ),
        data: (list) => ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: list.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (_, i) {
            final t = list[i];
            return ListTile(
              leading: CircleAvatar(
                child: Text(t.withUser.displayName.characters.first.toUpperCase()),
              ),
              title: Text(t.withUser.displayName),
              subtitle: Text(
                t.lastMessage ?? 'No messages yet',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(chatTimestamp(t.lastMessageAt),
                      style: const TextStyle(fontSize: 11, color: GenieColors.inkMuted)),
                  const SizedBox(height: 4),
                  if (t.unreadCount > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: const BoxDecoration(
                        color: GenieColors.primary,
                        shape: BoxShape.circle,
                      ),
                      child: Text('${t.unreadCount}',
                          style: const TextStyle(color: Colors.white, fontSize: 11)),
                    ),
                ],
              ),
              onTap: () async {
                await context.push('/messages/${t.id}');
                ref.invalidate(messageThreadsProvider);
                ref.invalidate(messagesUnreadProvider);
              },
            );
          },
        ),
      ),
    );
  }

  Future<void> _startChat(BuildContext context, WidgetRef ref) async {
    List<Friend> friends;
    try {
      friends = await ref.read(friendsProvider.future);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }
    if (!context.mounted) return;

    if (friends.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add a friend first — you can only message friends.')),
      );
      return;
    }

    final picked = await showModalBottomSheet<Friend>(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Text('Message a friend', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
            ...friends.map((f) => ListTile(
                  leading: CircleAvatar(
                    child: Text((f.name.isEmpty ? f.username : f.name).characters.first.toUpperCase()),
                  ),
                  title: Text(f.name.isEmpty ? '@${f.username}' : f.name),
                  subtitle: Text('@${f.username}'),
                  onTap: () => Navigator.of(context).pop(f),
                )),
          ],
        ),
      ),
    );
    if (picked == null || !context.mounted) return;

    try {
      final thread = await ref.read(messagesRepositoryProvider).startWith(userId: picked.userId);
      ref.invalidate(messageThreadsProvider);
      if (context.mounted) context.push('/messages/${thread.id}');
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}
