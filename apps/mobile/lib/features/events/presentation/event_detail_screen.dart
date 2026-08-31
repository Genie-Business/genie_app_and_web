import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../../wishlists/wishlists_repository.dart';
import '../event_models.dart';
import '../events_repository.dart';

class EventDetailScreen extends ConsumerWidget {
  const EventDetailScreen({super.key, required this.eventId});
  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final event = ref.watch(eventProvider(eventId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Event'),
        actions: [
          event.maybeWhen(
            data: (e) => PopupMenuButton<String>(
              onSelected: (v) async {
                if (v == 'delete') {
                  final ok = await _confirmDelete(context, e);
                  if (ok != true) return;
                  await ref.read(eventsRepositoryProvider).delete(e.id);
                  ref.invalidate(eventsListProvider);
                  if (context.mounted) context.pop();
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'delete', child: Text('Delete event')),
              ],
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: AsyncView<Event>(
        value: event,
        onRefresh: () => ref.refresh(eventProvider(eventId).future),
        data: (e) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text(e.name, style: GenieTheme.display(24)),
            const SizedBox(height: 6),
            Text('${e.type} · ${formatDate(e.eventDate)} (${relativeDay(e.eventDate)})',
                style: const TextStyle(color: GenieColors.inkSecondary)),
            if (e.isRecurring) ...[
              const SizedBox(height: 6),
              Row(
                children: const [
                  Icon(Icons.autorenew, size: 15, color: GenieColors.primary),
                  SizedBox(width: 6),
                  Text('Repeats every year',
                      style: TextStyle(color: GenieColors.primary, fontSize: 13, fontWeight: FontWeight.w600)),
                ],
              ),
            ],
            if (e.deliveryAddress != null) ...[
              const SizedBox(height: 4),
              Text('Deliver to: ${e.deliveryAddress}',
                  style: const TextStyle(color: GenieColors.inkMuted, fontSize: 13)),
            ],
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Wishlists', style: GenieTheme.display(18)),
                TextButton.icon(
                  onPressed: () => _addWishlist(context, ref, e.id),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (e.wishlists.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text('No wishlists yet — add one to start picking gifts.',
                      style: TextStyle(color: GenieColors.inkMuted)),
                ),
              )
            else
              ...e.wishlists.map(
                (w) => Card(
                  child: ListTile(
                    title: Text(w.name),
                    subtitle: Text('${w.itemCount} item${w.itemCount == 1 ? '' : 's'}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/wishlists/${w.id}'),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _addWishlist(BuildContext context, WidgetRef ref, String eventId) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New wishlist'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Name', hintText: 'e.g. Kitchen, Nursery'),
        ),
        actions: [
          TextButton(onPressed: () => ctx.pop(), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => ctx.pop(controller.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    try {
      final w = await ref
          .read(wishlistsRepositoryProvider)
          .create(eventId: eventId, name: name);
      ref.invalidate(eventProvider(eventId));
      ref.invalidate(eventsListProvider);
      if (context.mounted) context.push('/wishlists/${w.id}');
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<bool?> _confirmDelete(BuildContext context, Event e) => showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Delete "${e.name}"?'),
          content: const Text('The wishlists go with it. Gifts already received are kept.'),
          actions: [
            TextButton(onPressed: () => ctx.pop(false), child: const Text('Cancel')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: GenieColors.error),
              onPressed: () => ctx.pop(true),
              child: const Text('Delete'),
            ),
          ],
        ),
      );
}
