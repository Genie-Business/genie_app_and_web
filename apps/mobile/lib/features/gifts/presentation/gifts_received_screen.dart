import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../gift_models.dart';
import '../gifts_repository.dart';

class GiftsReceivedScreen extends ConsumerWidget {
  const GiftsReceivedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gifts = ref.watch(receivedGiftsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Gifts received')),
      body: AsyncView<List<ReceivedGift>>(
        value: gifts,
        onRefresh: () => ref.refresh(receivedGiftsProvider.future),
        emptyWhen: (l) => l.isEmpty,
        empty: const EmptyState(
          icon: Icons.redeem_rounded,
          title: 'No gifts yet',
          body: 'Gifts friends send to your wishlists will appear here.',
        ),
        data: (list) => ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) => _GiftCard(gift: list[i]),
        ),
      ),
    );
  }
}

class _GiftCard extends ConsumerWidget {
  const _GiftCard({required this.gift});
  final ReceivedGift gift;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fromLabel = gift.isAnonymous && !gift.revealed
        ? 'Anonymous'
        : (gift.from ?? 'A friend');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(gift.productName,
                      style: GenieTheme.display(16), maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                Text(formatKobo(gift.amountKobo),
                    style: const TextStyle(color: GenieColors.inkSecondary)),
              ],
            ),
            const SizedBox(height: 2),
            Text('${gift.eventName} · from $fromLabel',
                style: const TextStyle(color: GenieColors.inkMuted, fontSize: 12)),
            if (gift.message != null && gift.message!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('“${gift.message}”', style: const TextStyle(fontStyle: FontStyle.italic)),
            ],
            const SizedBox(height: 8),
            _DeliveryLine(status: gift.deliveryStatus),
            if (gift.canConfirmReceived) ...[
              const SizedBox(height: 10),
              FilledButton.icon(
                icon: const Icon(Icons.check_circle_outline, size: 18),
                label: const Text('I’ve received it'),
                onPressed: () async {
                  final messenger = ScaffoldMessenger.of(context);
                  try {
                    await ref.read(giftsRepositoryProvider).confirmReceived(gift.id);
                    ref.invalidate(receivedGiftsProvider);
                    messenger.showSnackBar(const SnackBar(content: Text('Thanks! Glad it arrived.')));
                  } on ApiException catch (e) {
                    messenger.showSnackBar(SnackBar(content: Text(e.message)));
                  }
                },
              ),
            ],
            if (gift.isAnonymous && gift.canReveal && !gift.revealed) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                icon: const Icon(Icons.visibility_outlined, size: 18),
                label: const Text('Reveal who sent this'),
                onPressed: () async {
                  final messenger = ScaffoldMessenger.of(context);
                  try {
                    await ref.read(giftsRepositoryProvider).reveal(gift.id);
                    ref.invalidate(receivedGiftsProvider);
                  } on ApiException catch (e) {
                    messenger.showSnackBar(SnackBar(content: Text(e.message)));
                  }
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// One line saying where the gift is, so the recipient knows when to confirm it.
class _DeliveryLine extends StatelessWidget {
  const _DeliveryLine({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (icon, text, color) = switch (status) {
      'DELIVERED' => (Icons.check_circle, 'Delivered', GenieColors.success),
      'IN_TRANSIT' => (Icons.local_shipping_outlined, 'On its way', GenieColors.primary),
      'DISPATCHED' => (Icons.local_shipping_outlined, 'Sent by the merchant', GenieColors.primary),
      _ => (Icons.inventory_2_outlined, 'Being prepared', GenieColors.inkMuted),
    };
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 6),
        Text(text, key: const ValueKey('delivery-line'), style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
