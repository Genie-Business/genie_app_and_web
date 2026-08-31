import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/genie_scaffold.dart';
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
  final _bankName = TextEditingController();
  final _bankAcct = TextEditingController();
  final _password = TextEditingController();

  String? _state;
  String? _lga;

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [
      _business,
      _code,
      _email,
      _username,
      _phone,
      _bankName,
      _bankAcct,
      _password,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ref.read(authControllerProvider.notifier).registerMerchant({
        'businessName': _business.text.trim(),
        'confirmationCode': _code.text.trim(),
        'email': _email.text.trim(),
        'username': _username.text.trim(),
        'businessPhone': _phone.text.trim(),
        'businessState': _state,
        'lga': _lga,
        'bankName': _bankName.text.trim(),
        'bankAccountNumber': _bankAcct.text.trim(),
        'password': _password.text,
      });
      if (mounted) {
        context.go('/auth/verify?email=${Uri.encodeComponent(_email.text.trim())}');
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
              GField(
                  label: 'Bank name',
                  controller: _bankName,
                  validator: (v) => Validators.required(v, 'Bank name')),
              GField(
                  label: 'Account number',
                  controller: _bankAcct,
                  keyboardType: TextInputType.number,
                  validator: Validators.accountNumber),
              GPasswordField(label: 'Password', controller: _password, validator: Validators.password),
            ],
          ),
        ),
      ],
    );
  }
}
