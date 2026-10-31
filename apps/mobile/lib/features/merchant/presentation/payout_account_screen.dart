import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../../banking/bank_account_fields.dart';
import '../../banking/bank_repository.dart';
import '../payout_repository.dart';

class PayoutAccountScreen extends ConsumerWidget {
  const PayoutAccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(payoutAccountProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settlement account')),
      body: AsyncView<PayoutAccount?>(
        value: account,
        onRefresh: () => ref.refresh(payoutAccountProvider.future),
        data: (acc) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            const Text(
              'genie pays your sales here after each delivery, minus fees.',
              style: TextStyle(color: GenieColors.inkSecondary, height: 1.4),
            ),
            const SizedBox(height: 20),
            _AccountForm(
              existing: acc,
              onSaved: () => ref.invalidate(payoutAccountProvider),
            ),
            const SizedBox(height: 28),
            Text('Recent payouts', style: GenieTheme.display(16)),
            const SizedBox(height: 8),
            const _PayoutHistory(),
          ],
        ),
      ),
    );
  }
}

class _AccountForm extends ConsumerStatefulWidget {
  const _AccountForm({required this.existing, required this.onSaved});
  final PayoutAccount? existing;
  final VoidCallback onSaved;

  @override
  ConsumerState<_AccountForm> createState() => _AccountFormState();
}

class _AccountFormState extends ConsumerState<_AccountForm> {
  final _form = GlobalKey<FormState>();
  final _bankAccount = BankAccountController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final a = widget.existing;
    if (a != null) {
      // Accounts saved before banks had codes come back without one; the merchant re-picks the bank.
      _bankAccount.seed(
        bank: a.bankCode == null ? null : Bank(code: a.bankCode!, name: a.bankName),
        number: a.accountNumber,
        name: a.accountName,
        verified: a.isVerified,
      );
    }
  }

  @override
  void dispose() {
    _bankAccount.dispose();
    super.dispose();
  }

  Future<ResolvedAccount> _lookupAccount({required String bankCode, required String accountNumber}) =>
      ref.read(bankRepositoryProvider).resolve(bankCode: bankCode, accountNumber: accountNumber);

  Future<void> _save() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    final bank = _bankAccount.bank!;
    setState(() => _loading = true);
    try {
      await ref.read(payoutRepositoryProvider).save(
            bankName: bank.name,
            bankCode: bank.code,
            accountNumber: _bankAccount.accountNumber,
            accountName: _bankAccount.accountName,
          );
      widget.onSaved();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Settlement account saved')));
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.existing?.isVerified ?? false)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Row(children: [
                Icon(Icons.verified, size: 16, color: GenieColors.success),
                SizedBox(width: 6),
                Text('Verified', style: TextStyle(color: GenieColors.success, fontSize: 13)),
              ]),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_error!, style: const TextStyle(color: GenieColors.error, fontSize: 13)),
            ),
          BankAccountFields(controller: _bankAccount, lookup: _lookupAccount),
          const SizedBox(height: 4),
          FilledButton(
            onPressed: _loading ? null : _save,
            child: _loading
                ? const SizedBox(
                    height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(widget.existing == null ? 'Save account' : 'Update account'),
          ),
        ],
      ),
    );
  }
}

class _PayoutHistory extends ConsumerWidget {
  const _PayoutHistory();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(payoutHistoryProvider);
    return history.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(12),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => const Text('Could not load payouts.',
          style: TextStyle(color: GenieColors.inkMuted, fontSize: 13)),
      data: (list) => list.isEmpty
          ? const Text('No payouts yet.',
              style: TextStyle(color: GenieColors.inkMuted, fontSize: 13))
          : Column(
              children: list
                  .map((p) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(formatKobo(p.netAmountKobo)),
                        subtitle: Text('${p.reference} · ${relativeDay(p.createdAt)}'),
                        trailing: Text(
                          p.status[0] + p.status.substring(1).toLowerCase(),
                          style: const TextStyle(fontSize: 12, color: GenieColors.inkSecondary),
                        ),
                      ))
                  .toList(),
            ),
    );
  }
}
