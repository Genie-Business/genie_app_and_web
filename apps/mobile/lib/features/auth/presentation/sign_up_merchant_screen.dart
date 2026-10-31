import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../../banking/bank_account_fields.dart';
import '../../banking/bank_repository.dart';
import '../auth_controller.dart';
import '../nigeria_geo.dart';
import '../validators.dart';
import 'widgets.dart';

class SignUpMerchantScreen extends ConsumerStatefulWidget {
  const SignUpMerchantScreen({super.key});

  @override
  ConsumerState<SignUpMerchantScreen> createState() => _State();
}

class _State extends ConsumerState<SignUpMerchantScreen> {
  final _form = GlobalKey<FormState>();
  final _business = TextEditingController();
  final _code = TextEditingController();
  final _email = TextEditingController();
  final _username = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _bankAccount = BankAccountController();

  /// Ticks when the confirmation code looks complete. A failed account check is
  /// retried then, rather than on every keystroke, so half-typed codes don't hit the server.
  final _codeReady = ValueNotifier<int>(0);
  static final _codeShape = RegExp(r'^GENIE-[A-Za-z0-9]{6}$');

  String? _state;
  String? _lga;

  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _code.addListener(() {
      if (_codeShape.hasMatch(_code.text.trim())) _codeReady.value++;
    });
  }

  @override
  void dispose() {
    for (final c in [
      _business,
      _code,
      _email,
      _username,
      _phone,
      _password,
    ]) {
      c.dispose();
    }
    _bankAccount.dispose();
    _codeReady.dispose();
    super.dispose();
  }

  /// The name lookup needs the confirmation code: there is no session yet, so the
  /// code is what tells the server this is a genuine merchant sign-up.
  Future<ResolvedAccount> _lookupAccount({required String bankCode, required String accountNumber}) {
    final code = _code.text.trim();
    if (code.length < 4) {
      throw ApiException('confirmation_code_required', 'Enter your confirmation code above to check your account.');
    }
    return ref.read(bankRepositoryProvider).resolve(
          bankCode: bankCode,
          accountNumber: accountNumber,
          confirmationCode: code,
          auth: false,
        );
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      final code = await ref.read(authControllerProvider.notifier).registerMerchant({
        'businessName': _business.text.trim(),
        'confirmationCode': _code.text.trim(),
        'email': _email.text.trim(),
        'username': _username.text.trim(),
        'businessPhone': _phone.text.trim(),
        'businessState': _state,
        'lga': _lga,
        'bankName': _bankAccount.bank?.name,
        'bankCode': _bankAccount.bank?.code,
        'bankAccountNumber': _bankAccount.accountNumber,
        if (_bankAccount.accountName != null) 'bankAccountName': _bankAccount.accountName,
        'password': _password.text,
      });
      if (mounted) {
        final email = Uri.encodeComponent(_email.text.trim());
        context.go('/auth/verify?email=$email${code != null ? '&code=$code' : ''}');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GenieFormScaffold(
      showLogo: true,
      title: 'Register your business',
      subtitle: 'You need a genie merchant confirmation code to continue.',
      primaryAction: FilledButton(
        onPressed: _loading ? null : _submit,
        child: _loading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : const Text('Continue'),
      ),
      children: [
        Form(
          key: _form,
          child: Column(
            children: [
              GenieErrorText(_error),
              GField(
                  label: 'Business name',
                  controller: _business,
                  textCapitalization: TextCapitalization.words,
                  validator: (v) => Validators.required(v, 'Business name')),
              GField(
                  label: 'Confirmation code',
                  controller: _code,
                  validator: (v) => Validators.required(v, 'Confirmation code')),
              GField(
                  label: 'Business email',
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  validator: Validators.email),
              GField(label: 'Username', controller: _username, validator: Validators.username),
              GField(
                  label: 'Business phone',
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  validator: Validators.phone),
              GDropdownField(
                label: 'Business state',
                value: _state,
                items: nigeriaStates,
                onChanged: (v) => setState(() {
                  _state = v;
                  _lga = null;
                }),
                validator: (v) => Validators.required(v, 'State'),
              ),
              GDropdownField(
                label: 'Local government area',
                value: _lga,
                items: lgasFor(_state),
                enabled: _state != null,
                hint: _state == null ? 'Pick a state first' : null,
                onChanged: (v) => setState(() => _lga = v),
                validator: (v) => Validators.required(v, 'LGA'),
              ),
              BankAccountFields(
                controller: _bankAccount,
                lookup: _lookupAccount,
                retryWhen: _codeReady,
              ),
              GPasswordField(label: 'Password', controller: _password, validator: Validators.password),
            ],
          ),
        ),
      ],
    );
  }
}
