import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../theme/genie_theme.dart';
import '../auth/validators.dart';
import 'bank_repository.dart';

/// Where the "who owns this account?" check has got to.
enum LookupStatus {
  /// Waiting for a bank and a full 10-digit number.
  idle,
  resolving,

  /// The bank told us the name on the account.
  resolved,

  /// The bank has no such account.
  notFound,

  /// We can't check right now; the merchant types the name instead.
  unavailable,

  /// The check failed for another reason (offline, rate limited). Can be retried.
  failed,
}

typedef AccountLookup = Future<ResolvedAccount> Function({
  required String bankCode,
  required String accountNumber,
});

/// What a [BankAccountFields] form currently holds. The screen that owns the form
/// reads the values it needs to submit from here.
class BankAccountController extends ChangeNotifier {
  Bank? _bank;
  String _number = '';
  String _manualName = '';
  LookupStatus _status = LookupStatus.idle;
  String? _resolvedName;
  String? _message;

  Bank? get bank => _bank;
  String get accountNumber => _number;
  String get manualName => _manualName;
  LookupStatus get status => _status;
  String? get message => _message;

  /// True only when the bank itself told us the name.
  bool get verified => _status == LookupStatus.resolved;

  /// The name to save: the bank's once looked up, or the typed one when the
  /// lookup isn't available. Null when there is nothing usable yet.
  String? get accountName {
    switch (_status) {
      case LookupStatus.resolved:
        return _resolvedName;
      case LookupStatus.unavailable:
        final typed = _manualName.trim();
        return typed.isEmpty ? null : typed;
      default:
        return null;
    }
  }

  /// Prefill from a saved account.
  void seed({Bank? bank, String number = '', String name = '', bool verified = false}) {
    _bank = bank;
    _number = number;
    _manualName = name;
    _resolvedName = verified ? name : null;
    _message = null;
    _status = verified ? LookupStatus.resolved : LookupStatus.idle;
  }

  void setBank(Bank? bank) {
    _bank = bank;
    notifyListeners();
  }

  void setNumber(String number) {
    _number = number;
    notifyListeners();
  }

  void setManualName(String name) {
    _manualName = name;
    notifyListeners();
  }

  void setLookup(LookupStatus status, {String? name, String? message}) {
    _status = status;
    _resolvedName = status == LookupStatus.resolved ? name : null;
    _message = message;
    notifyListeners();
  }
}

/// Bank picker, account number, and the name the bank holds on that account.
///
/// Once a bank and a 10-digit number are in, the name is looked up and shown so
/// the merchant can see it's the right account. If the lookup can't be made the
/// merchant types the name instead, and it is saved as unverified.
///
/// Must sit inside a [Form]: its fields validate with it.
class BankAccountFields extends ConsumerStatefulWidget {
  const BankAccountFields({
    super.key,
    required this.controller,
    required this.lookup,
    this.retryWhen,
  });

  final BankAccountController controller;

  /// Performs the name enquiry; throws [ApiException] on failure.
  final AccountLookup lookup;

  /// When this notifies and the last check had failed, it is retried. Sign-up
  /// passes its confirmation-code field, since the check needs the code.
  final Listenable? retryWhen;

  @override
  ConsumerState<BankAccountFields> createState() => _BankAccountFieldsState();
}

class _BankAccountFieldsState extends ConsumerState<BankAccountFields> {
  late final TextEditingController _number;
  late final TextEditingController _name;
  int _request = 0;

  BankAccountController get _c => widget.controller;

  @override
  void initState() {
    super.initState();
    _number = TextEditingController(text: _c.accountNumber);
    _name = TextEditingController(text: _c.manualName);
    _c.addListener(_onChanged);
    widget.retryWhen?.addListener(_retryIfFailed);
    // A saved account that was never checked gets checked as soon as the form opens.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _c.bank != null && _c.accountNumber.length == 10 && !_c.verified) _lookup();
    });
  }

  @override
  void dispose() {
    _c.removeListener(_onChanged);
    widget.retryWhen?.removeListener(_retryIfFailed);
    _number.dispose();
    _name.dispose();
    super.dispose();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  void _retryIfFailed() {
    if (_c.status == LookupStatus.failed) _lookup();
  }

  Future<void> _pickBank(List<Bank> banks) async {
    final picked = await showModalBottomSheet<Bank>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _BankPickerSheet(banks: banks, selected: _c.bank),
    );
    if (picked == null || picked == _c.bank) return;
    _c.setBank(picked);
    _lookup();
  }

  void _numberChanged(String value) {
    _c.setNumber(value);
    _lookup();
  }

  Future<void> _lookup() async {
    final bank = _c.bank;
    final number = _c.accountNumber;
    final id = ++_request; // anything still in flight for an earlier bank or number is now stale
    if (bank == null || number.length != 10) {
      _c.setLookup(LookupStatus.idle);
      return;
    }
    _c.setLookup(LookupStatus.resolving);
    try {
      final found = await widget.lookup(bankCode: bank.code, accountNumber: number);
      if (!mounted || id != _request) return;
      _c.setLookup(LookupStatus.resolved, name: found.accountName);
    } on ApiException catch (e) {
      if (!mounted || id != _request) return;
      switch (e.code) {
        case 'account_not_found':
          _c.setLookup(LookupStatus.notFound, message: e.message);
        case 'account_lookup_unavailable':
          _c.setLookup(LookupStatus.unavailable, message: e.message);
        default:
          _c.setLookup(LookupStatus.failed, message: e.message);
      }
    } catch (_) {
      if (!mounted || id != _request) return;
      _c.setLookup(LookupStatus.failed, message: 'Could not check this account. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final banks = ref.watch(banksProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _bankField(banks),
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: TextFormField(
            controller: _number,
            keyboardType: TextInputType.number,
            maxLength: 10,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            autovalidateMode: AutovalidateMode.onUserInteraction,
            validator: Validators.accountNumber,
            onChanged: _numberChanged,
            decoration: const InputDecoration(labelText: 'Account number', counterText: ''),
          ),
        ),
        // Blocks submit while a check is running or has found a problem; the status row says which.
        FormField<void>(
          validator: (_) {
            switch (_c.status) {
              case LookupStatus.resolving:
                return 'Wait for the account check to finish.';
              case LookupStatus.notFound:
              case LookupStatus.failed:
                return _c.message ?? 'Check the account details.';
              default:
                return null;
            }
          },
          builder: (_) => const SizedBox.shrink(),
        ),
        _statusRow(),
        if (_c.status == LookupStatus.unavailable)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              autovalidateMode: AutovalidateMode.onUserInteraction,
              validator: (v) => Validators.required(v, 'Account name'),
              onChanged: _c.setManualName,
              decoration: const InputDecoration(labelText: 'Account name'),
            ),
          ),
      ],
    );
  }

  Widget _bankField(AsyncValue<List<Bank>> banks) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: FormField<Bank>(
        key: ValueKey(_c.bank?.code),
        initialValue: _c.bank,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        validator: (v) => v == null ? 'Choose your bank.' : null,
        builder: (field) {
          final list = banks.valueOrNull;
          final failed = banks.hasError && list == null;
          return InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () {
              if (list != null) {
                _pickBank(list);
              } else if (failed) {
                ref.invalidate(banksProvider);
              }
            },
            child: InputDecorator(
              isEmpty: _c.bank == null,
              decoration: InputDecoration(
                labelText: 'Bank',
                errorText: field.errorText ??
                    (failed ? 'Could not load the list of banks. Tap to try again.' : null),
                suffixIcon: list == null && !failed
                    ? const Padding(
                        padding: EdgeInsets.all(14),
                        child: SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                      )
                    : const Icon(Icons.arrow_drop_down),
              ),
              child: Text(_c.bank?.name ?? '', overflow: TextOverflow.ellipsis),
            ),
          );
        },
      ),
    );
  }

  Widget _statusRow() {
    final theme = Theme.of(context).textTheme.bodySmall;
    Widget row(IconData icon, Color color, Widget text) => Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(padding: const EdgeInsets.only(top: 1), child: Icon(icon, size: 18, color: color)),
              const SizedBox(width: 8),
              Expanded(child: text),
            ],
          ),
        );

    switch (_c.status) {
      case LookupStatus.idle:
        return const SizedBox.shrink();
      case LookupStatus.resolving:
        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(children: [
            const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 10),
            Text('Checking the account name...', style: theme?.copyWith(color: GenieColors.inkSecondary)),
          ]),
        );
      case LookupStatus.resolved:
        return row(
          Icons.check_circle,
          GenieColors.success,
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _c.accountName ?? '',
                key: const ValueKey('resolved-account-name'),
                style: const TextStyle(fontWeight: FontWeight.w600, color: GenieColors.ink),
              ),
              Text('Name on this account, from your bank', style: theme?.copyWith(color: GenieColors.inkMuted)),
            ],
          ),
        );
      case LookupStatus.notFound:
        return row(
          Icons.error_outline,
          GenieColors.error,
          Text(_c.message ?? 'We could not find that account.', style: theme?.copyWith(color: GenieColors.error)),
        );
      case LookupStatus.unavailable:
        return row(
          Icons.info_outline,
          GenieColors.inkMuted,
          Text(
            "We can't check account names right now. Type the name exactly as it appears on the account and we'll verify it later.",
            style: theme?.copyWith(color: GenieColors.inkSecondary),
          ),
        );
      case LookupStatus.failed:
        return row(
          Icons.error_outline,
          GenieColors.error,
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(_c.message ?? 'Could not check this account.', style: theme?.copyWith(color: GenieColors.error)),
              TextButton(
                onPressed: _lookup,
                style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                child: const Text('Try again'),
              ),
            ],
          ),
        );
    }
  }
}

class _BankPickerSheet extends StatefulWidget {
  const _BankPickerSheet({required this.banks, required this.selected});
  final List<Bank> banks;
  final Bank? selected;

  @override
  State<_BankPickerSheet> createState() => _BankPickerSheetState();
}

class _BankPickerSheetState extends State<_BankPickerSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final shown = q.isEmpty
        ? widget.banks
        : widget.banks.where((b) => b.name.toLowerCase().contains(q)).toList();
    final height = MediaQuery.sizeOf(context).height;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: height * 0.7,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: TextField(
                autofocus: true,
                onChanged: (v) => setState(() => _query = v),
                decoration: const InputDecoration(
                  hintText: 'Search banks',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
            ),
            Expanded(
              child: shown.isEmpty
                  ? const Center(
                      child: Text('No bank matches that.', style: TextStyle(color: GenieColors.inkMuted)),
                    )
                  : ListView.builder(
                      itemCount: shown.length,
                      itemBuilder: (_, i) {
                        final bank = shown[i];
                        return ListTile(
                          title: Text(bank.name),
                          trailing: bank == widget.selected
                              ? const Icon(Icons.check, color: GenieColors.primary)
                              : null,
                          onTap: () => Navigator.of(context).pop(bank),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
