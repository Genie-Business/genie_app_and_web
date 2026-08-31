import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format.dart';
import '../../../theme/genie_theme.dart';
import '../../wallet/wallet_repository.dart';
import '../gifts_repository.dart';

/// "Gifting" tab — wallet at a glance, gift a friend, gifts received.
class GiftingTabScreen extends ConsumerWidget {
  const GiftingTabScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final balance = ref.watch(walletBalanceProvider);
    final received = ref.watch(receivedGiftsProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(walletBalanceProvider);
        ref.invalidate(receivedGiftsProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: GenieColors.primary,
            child: InkWell(
              onTap: () => context.push('/wallet'),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Wallet balance',
                            style: TextStyle(color: Colors.white70, fontSize: 12)),
                        const SizedBox(height: 4),
                        balance.when(
                          data: (w) => Text(formatKobo(w.balanceKobo),
                              style: GenieTheme.display(26).copyWith(color: Colors.white)),
                          loading: () => const SizedBox(
                              height: 26,
                              width: 26,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)),
                          error: (_, __) => const Text('—',
                              style: TextStyle(color: Colors.white, fontSize: 22)),
                        ),
                      ],
                    ),
                    const Spacer(),
                    const Icon(Icons.chevron_right, color: Colors.white70),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => context.push('/gift'),
            icon: const Icon(Icons.card_giftcard),
            label: const Text('Gift a friend'),
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Gifts received', style: GenieTheme.display(18)),
              TextButton(
                onPressed: () => context.push('/gifts/received'),
                child: const Text('See all'),
              ),
            ],
          ),
          received.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, __) => const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Could not load gifts.', style: TextStyle(color: GenieColors.inkMuted)),
            ),
            data: (list) => list.isEmpty
                ? const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Text('No gifts yet — share a wishlist to get started.',
                        style: TextStyle(color: GenieColors.inkMuted)),
                  )
                : Column(
                    children: list
                        .take(3)
                        .map((g) => Card(
                              child: ListTile(
                                leading: const Icon(Icons.redeem, color: GenieColors.primary),
                                title: Text(g.productName,
                                    maxLines: 1, overflow: TextOverflow.ellipsis),
                                subtitle: Text(
                                    '${g.eventName} · ${g.isAnonymous && !g.revealed ? 'Anonymous' : (g.from ?? 'A friend')}'),
                                trailing: Text(formatKobo(g.amountKobo),
                                    style: const TextStyle(fontSize: 12)),
                              ),
                            ))
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }
}
