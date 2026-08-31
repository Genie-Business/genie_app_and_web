import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../event_models.dart';
import '../events_repository.dart';

/// The celebrant's "Events" tab.
class EventsScreen extends ConsumerWidget {
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(eventsListProvider);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/events/new'),
        icon: const Icon(Icons.add),
        label: const Text('New event'),
      ),
      body: AsyncView<List<Event>>(
        value: events,
        onRefresh: () => ref.refresh(eventsListProvider.future),
        emptyWhen: (l) => l.isEmpty,
        empty: EmptyState(
          icon: Icons.celebration_rounded,
          title: 'No events yet',
          body: 'Create a birthday, wedding or any celebration, then build a wishlist for it.',
          action: FilledButton(
            onPressed: () => context.push('/events/new'),
            child: const Text('Create an event'),
          ),
        ),
        data: (list) => ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (_, i) => _EventCard(list[i]),
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard(this.event);
  final Event event;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/events/${event.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(event.name,
                        style: GenieTheme.display(18), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                  if (event.isRecurring) ...[
                    const Icon(Icons.autorenew, size: 14, color: GenieColors.primary),
                    const SizedBox(width: 4),
                  ],
                  _Pill(text: event.type),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '${formatDate(event.eventDate)} · ${relativeDay(event.eventDate)}'
                '${event.isRecurring ? ' · repeats yearly' : ''}',
                style: const TextStyle(color: GenieColors.inkSecondary, fontSize: 13),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _Stat(label: 'Wishlists', value: '${event.wishlistCount}'),
                  const SizedBox(width: 24),
                  _Stat(label: 'Items', value: '${event.itemCount}'),
                  const Spacer(),
                  if (event.itemCount > 0) _FulfilRing(pct: event.fulfilmentPct),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: GenieTheme.display(16)),
          Text(label, style: const TextStyle(color: GenieColors.inkMuted, fontSize: 11)),
        ],
      );
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: GenieColors.primarySoft,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(text,
            style: const TextStyle(
                color: GenieColors.primaryDark, fontSize: 11, fontWeight: FontWeight.w600)),
      );
}

class _FulfilRing extends StatelessWidget {
  const _FulfilRing({required this.pct});
  final int pct;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 40,
        width: 40,
        child: Stack(
          alignment: Alignment.center,
          children: [
            CircularProgressIndicator(
              value: pct / 100,
              strokeWidth: 4,
              backgroundColor: GenieColors.subtle,
            ),
            Text('$pct%', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
          ],
        ),
      );
}
