import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../wallet_models.dart';
import '../wallet_repository.dart';

class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final balance = ref.watch(walletBalanceProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Wallet')),
      body: AsyncView<WalletBalance>(
        value: balance,
        onRefresh: () => ref.refresh(walletBalanceProvider.future),
        data: (w) => ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              color: GenieColors.primary,
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('genie wallet',
                        style: TextStyle(color: Colors.white70, fontSize: 13)),
                    const SizedBox(height: 6),
                    Text(formatKobo(w.balanceKobo),
                        style: GenieTheme.display(32).copyWith(color: Colors.white)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => _addFunds(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('Add funds'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _addFunds(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final amount = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AddFundsSheet(),
    );
    if (amount == null) return;
    try {
      final repo = ref.read(walletRepositoryProvider);
      final intent = await repo.addFunds(amount);
      // Preview build: auto-settle so the balance updates without a real transfer.
      await repo.simulatePayment(intent.reference, amount);
      ref.invalidate(walletBalanceProvider);
      messenger.showSnackBar(SnackBar(content: Text('Added ${formatKobo('$amount')}')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _AddFundsSheet extends StatefulWidget {
  const _AddFundsSheet();
  @override
  State<_AddFundsSheet> createState() => _AddFundsSheetState();
}

class _AddFundsSheetState extends State<_AddFundsSheet> {
  final _controller = TextEditingController();
  static const _presets = [1000, 5000, 10000, 25000];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Add funds', style: GenieTheme.display(20)),
          const SizedBox(height: 4),
          const Text('Preview build — no real payment is taken.',
              style: TextStyle(color: GenieColors.inkMuted, fontSize: 12)),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            children: _presets
                .map((n) => ActionChip(
                      label: Text('₦${n ~/ 1}'),
                      onPressed: () => Navigator.of(context).pop(n * 100),
                    ))
                .toList(),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Amount (₦)', prefixText: '₦ '),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () {
              final naira = int.tryParse(_controller.text.trim());
              if (naira == null || naira < 100) return;
              Navigator.of(context).pop(naira * 100);
            },
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }
}
