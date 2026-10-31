import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../../../theme/genie_theme.dart';
import '../../banking/bank_account_fields.dart';
import '../../banking/bank_repository.dart';
import '../auth_controller.dart';
import '../nigeria_geo.dart';
import '../validators.dart';
import 'widgets.dart';

/// Where the merchant is in confirming their email.
enum _EmailStep { enterEmail, enterCode, verified }

class SignUpMerchantScreen extends ConsumerStatefulWidget {
  const SignUpMerchantScreen({super.key});

  @override
  ConsumerState<SignUpMerchantScreen> createState() => _State();
}

class _State extends ConsumerState<SignUpMerchantScreen> {
  static const _resendSeconds = 30;

  final _emailForm = GlobalKey<FormState>();
  final _form = GlobalKey<FormState>();
  final _business = TextEditingController();
  final _email = TextEditingController();
  final _otp = TextEditingController();
  final _username = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _bankAccount = BankAccountController();

  _EmailStep _step = _EmailStep.enterEmail;
  String? _signupToken;
  Timer? _cooldownTimer;
  int _cooldown = 0;

  String? _state;
  String? _lga;

  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    for (final c in [_business, _email, _otp, _username, _phone, _password]) {
      c.dispose();
    }
    _bankAccount.dispose();
    super.dispose();
  }

  void _startCooldown() {
    _cooldownTimer?.cancel();
    setState(() => _cooldown = _resendSeconds);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _cooldown -= 1);
      if (_cooldown <= 0) t.cancel();
    });
  }

  /// Runs [action] with the busy flag and error banner handled in one place.
  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendCode() async {
    // The email form is only on screen at the first step; a resend reuses the address already checked.
    if (_step == _EmailStep.enterEmail && !_emailForm.currentState!.validate()) return;
    await _run(() async {
      final echoed = await ref.read(authControllerProvider.notifier).requestMerchantCode(_email.text.trim());
      if (!mounted) return;
      _otp.text = echoed ?? '';
      setState(() => _step = _EmailStep.enterCode);
      _startCooldown();
    });
  }

  Future<void> _verifyCode() async {
    if (_otp.text.trim().length != 6) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }
    await _run(() async {
      final token = await ref
          .read(authControllerProvider.notifier)
          .verifyMerchantCode(email: _email.text.trim(), code: _otp.text.trim());
      if (!mounted) return;
      setState(() {
        _signupToken = token;
        _step = _EmailStep.verified;
      });
    });
  }

  void _changeEmail() {
    _cooldownTimer?.cancel();
    setState(() {
      _step = _EmailStep.enterEmail;
      _signupToken = null;
      _otp.clear();
      _error = null;
      _cooldown = 0;
    });
  }

  /// The name lookup is only allowed once the email is confirmed; the signup
  /// token is what tells the server that.
  Future<ResolvedAccount> _lookupAccount({required String bankCode, required String accountNumber}) {
    final token = _signupToken;
    if (token == null) {
      throw ApiException('email_not_verified', 'Confirm your email first.');
    }
    return ref.read(bankRepositoryProvider).resolve(
          bankCode: bankCode,
          accountNumber: accountNumber,
          signupToken: token,
          auth: false,
        );
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await ref.read(authControllerProvider.notifier).registerMerchant({
        'businessName': _business.text.trim(),
        'signupToken': _signupToken,
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
      // Signed in: the router moves on from here.
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
      // A token that has lapsed (or no longer matches) needs the email confirmed again.
      if (e.message.startsWith('Your email confirmation') || e.message.startsWith('That email does not match')) {
        _changeEmail();
        setState(() => _error = e.message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final verified = _step == _EmailStep.verified;
    return GenieFormScaffold(
      showLogo: true,
      title: 'Register your business',
      subtitle: verified
          ? 'Your email is confirmed. Tell us about your business.'
          : 'First, confirm your business email. We will send you a code.',
      primaryAction: verified
          ? FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Create account'),
            )
          : null,
      children: [
        GenieErrorText(_error),
        _emailSection(),
        if (verified)
          Form(
            key: _form,
            child: Column(
              children: [
                GField(
                    label: 'Business name',
                    controller: _business,
                    textCapitalization: TextCapitalization.words,
                    validator: (v) => Validators.required(v, 'Business name')),
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
                BankAccountFields(controller: _bankAccount, lookup: _lookupAccount),
                GPasswordField(label: 'Password', controller: _password, validator: Validators.password),
              ],
            ),
          ),
      ],
    );
  }

  Widget _emailSection() {
    switch (_step) {
      case _EmailStep.enterEmail:
        return Form(
          key: _emailForm,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              GField(
                label: 'Business email',
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                validator: Validators.email,
              ),
              FilledButton(
                onPressed: _busy ? null : _sendCode,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Send code'),
              ),
            ],
          ),
        );
      case _EmailStep.enterCode:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Text(
                'We sent a 6-digit code to ${_email.text.trim()}. It can take a minute to arrive.',
                style: const TextStyle(color: GenieColors.inkSecondary, height: 1.4),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: TextField(
                controller: _otp,
                autofocus: true,
                keyboardType: TextInputType.number,
                maxLength: 6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(labelText: 'Merchant code', counterText: ''),
                onChanged: (v) {
                  if (v.length == 6 && !_busy) _verifyCode();
                },
              ),
            ),
            FilledButton(
              onPressed: _busy ? null : _verifyCode,
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Verify'),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton(
                  onPressed: (_busy || _cooldown > 0) ? null : _sendCode,
                  child: Text(_cooldown > 0 ? 'Resend in ${_cooldown}s' : 'Resend code'),
                ),
                TextButton(onPressed: _busy ? null : _changeEmail, child: const Text('Change email')),
              ],
            ),
          ],
        );
      case _EmailStep.verified:
        return Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: Row(
            children: [
              const Icon(Icons.check_circle, size: 18, color: GenieColors.success),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _email.text.trim(),
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, color: GenieColors.ink),
                ),
              ),
              TextButton(
                onPressed: _busy ? null : _changeEmail,
                style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                child: const Text('Change'),
              ),
            ],
          ),
        );
    }
  }
}
