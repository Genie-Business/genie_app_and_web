import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../../messages/messages_repository.dart';
import '../friends_repository.dart';

class FriendsScreen extends ConsumerWidget {
  const FriendsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final friends = ref.watch(friendsProvider);
    final requests = ref.watch(friendRequestsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Friends'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add_alt_1),
            onPressed: () => _addFriend(context, ref),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(friendsProvider);
          ref.invalidate(friendRequestsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            requests.maybeWhen(
              data: (reqs) {
                final incoming = reqs.where((r) => r.incoming).toList();
                if (incoming.isEmpty) return const SizedBox.shrink();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Requests', style: GenieTheme.display(15)),
                    const SizedBox(height: 6),
                    ...incoming.map((r) => Card(
                          child: ListTile(
                            title: Text(r.name.isEmpty ? '@${r.username}' : r.name),
                            subtitle: Text('@${r.username}'),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.check, color: GenieColors.success),
                                  onPressed: () => _act(context, ref,
                                      () => ref.read(friendsRepositoryProvider).accept(r.id)),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.close, color: GenieColors.error),
                                  onPressed: () => _act(context, ref,
                                      () => ref.read(friendsRepositoryProvider).decline(r.id)),
                                ),
                              ],
                            ),
                          ),
                        )),
                    const SizedBox(height: 16),
                  ],
                );
              },
              orElse: () => const SizedBox.shrink(),
            ),
            AsyncView<List<Friend>>(
              value: friends,
              emptyWhen: (l) => l.isEmpty,
              empty: const EmptyState(
                icon: Icons.people_outline_rounded,
                title: 'No friends yet',
                body: 'Add friends by username to see and gift from their wishlists.',
              ),
              data: (list) => Column(
                children: list
                    .map((f) => Card(
                          child: ListTile(
                            leading: CircleAvatar(
                              child: Text(
                                  (f.name.isEmpty ? f.username : f.name).characters.first.toUpperCase()),
                            ),
                            title: Text(f.name.isEmpty ? '@${f.username}' : f.name),
                            subtitle: Text('@${f.username}'),
                            trailing: IconButton(
                              icon: const Icon(Icons.forum_outlined),
                              tooltip: 'Message',
                              onPressed: () => _message(context, ref, f),
                            ),
                          ),
                        ))
                    .toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _message(BuildContext context, WidgetRef ref, Friend f) async {
    try {
      final thread = await ref.read(messagesRepositoryProvider).startWith(userId: f.userId);
      if (context.mounted) context.push('/messages/${thread.id}');
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _act(BuildContext context, WidgetRef ref, Future<void> Function() fn) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await fn();
      ref.invalidate(friendsProvider);
      ref.invalidate(friendRequestsProvider);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _addFriend(BuildContext context, WidgetRef ref) async {
    final c = TextEditingController();
    final username = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add a friend'),
        content: TextField(
          controller: c,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Username', prefixText: '@'),
        ),
        actions: [
          TextButton(onPressed: () => ctx.pop(), child: const Text('Cancel')),
          FilledButton(onPressed: () => ctx.pop(c.text.trim()), child: const Text('Send request')),
        ],
      ),
    );
    if (username == null || username.isEmpty) return;
    if (!context.mounted) return;
    await _act(context, ref, () => ref.read(friendsRepositoryProvider).sendRequest(username));
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Friend request sent to @$username')));
    }
  }
}
