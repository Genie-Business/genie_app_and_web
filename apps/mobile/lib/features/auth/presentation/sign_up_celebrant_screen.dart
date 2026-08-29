import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../auth_controller.dart';
import '../validators.dart';
import 'widgets.dart';

class SignUpCelebrantScreen extends ConsumerStatefulWidget {
  const SignUpCelebrantScreen({super.key});

  @override
  ConsumerState<SignUpCelebrantScreen> createState() => _State();
}

class _State extends ConsumerState<SignUpCelebrantScreen> {
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _username = TextEditingController();
  final _phone = TextEditingController();
  final _state = TextEditingController();
  final _password = TextEditingController();
  final _referral = TextEditingController();

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_first, _last, _email, _username, _phone, _state, _password, _referral]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ref.read(authControllerProvider.notifier).registerCelebrant({
        'firstName': _first.text.trim(),
        'lastName': _last.text.trim(),
        'email': _email.text.trim(),
        'username': _username.text.trim(),
        'phone': _phone.text.trim(),
        'stateOfResidence': _state.text.trim(),
        'password': _password.text,
        if (_referral.text.trim().isNotEmpty) 'referralCode': _referral.text.trim(),
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
      title: 'Create your account',
      subtitle: 'You can start building wishlists straight away.',
      primaryAction: FilledButton(
        onPressed: _loading ? null : _submit,
        child: _loading ? const _Spin() : const Text('Continue'),
      ),
      children: [
        Form(
          key: _form,
          child: Column(
            children: [
              GenieErrorText(_error),
              Row(children: [
                Expanded(
                  child: GField(
                      label: 'First name',
                      controller: _first,
                      textCapitalization: TextCapitalization.words,
                      validator: (v) => Validators.required(v, 'First name')),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: GField(
                      label: 'Last name',
                      controller: _last,
                      textCapitalization: TextCapitalization.words,
                      validator: (v) => Validators.required(v, 'Last name')),
                ),
              ]),
              GField(
                  label: 'Email',
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  validator: Validators.email),
              GField(label: 'Username', controller: _username, validator: Validators.username),
              GField(
                  label: 'Phone number',
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  validator: Validators.phone),
              GField(
                  label: 'State of residence',
                  controller: _state,
                  validator: (v) => Validators.required(v, 'State')),
              GPasswordField(label: 'Password', controller: _password, validator: Validators.password),
              GField(label: 'Referral code (optional)', controller: _referral),
            ],
          ),
        ),
      ],
    );
  }
}

class _Spin extends StatelessWidget {
  const _Spin();
  @override
  Widget build(BuildContext context) => const SizedBox(
        height: 20,
        width: 20,
        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
      );
}
