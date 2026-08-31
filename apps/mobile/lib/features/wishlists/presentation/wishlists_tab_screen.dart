import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../../events/event_models.dart';
import '../../events/events_repository.dart';

/// "Wishlists" tab — every wishlist the celebrant has, grouped by event.
class WishlistsTabScreen extends ConsumerWidget {
  const WishlistsTabScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(eventsListProvider);

    return AsyncView<List<Event>>(
      value: events,
      onRefresh: () => ref.refresh(eventsListProvider.future),
      emptyWhen: (l) => l.every((e) => e.wishlists.isEmpty),
      empty: EmptyState(
        icon: Icons.card_giftcard_rounded,
        title: 'No wishlists yet',
        body: 'Create an event first, then add a wishlist to it.',
        action: FilledButton(
          onPressed: () => context.push('/events/new'),
          child: const Text('Create an event'),
        ),
      ),
      data: (list) {
        final withLists = list.where((e) => e.wishlists.isNotEmpty).toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            for (final e in withLists) ...[
              Padding(
                padding: const EdgeInsets.only(top: 8, bottom: 4),
                child: Text(e.name,
                    style: GenieTheme.display(15).copyWith(color: GenieColors.inkSecondary)),
              ),
              ...e.wishlists.map(
                (w) => Card(
                  child: ListTile(
                    leading: const Icon(Icons.card_giftcard_outlined, color: GenieColors.primary),
                    title: Text(w.name),
                    subtitle: Text('${w.itemCount} item${w.itemCount == 1 ? '' : 's'}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/wishlists/${w.id}'),
                  ),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
