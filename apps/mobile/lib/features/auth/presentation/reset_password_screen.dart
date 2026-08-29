import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../auth_controller.dart';
import '../validators.dart';
import 'widgets.dart';

class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, required this.email});
  final String email;

  @override
  ConsumerState<ResetPasswordScreen> createState() => _State();
}

class _State extends ConsumerState<ResetPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;
  bool _done = false;

  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ref.read(authControllerProvider.notifier).resetPassword(
            email: widget.email,
            code: _code.text.trim(),
            newPassword: _password.text,
          );
      if (mounted) setState(() => _done = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_done) {
      return GenieFormScaffold(
        title: 'Password reset',
        subtitle: 'You can now sign in with your new password.',
        primaryAction: FilledButton(
          onPressed: () => context.go('/auth/sign-in'),
          child: const Text('Back to sign in'),
        ),
        children: const [Icon(Icons.check_circle_rounded, color: Color(0xFF16A46B), size: 56)],
      );
    }

    return GenieFormScaffold(
      title: 'Enter your new password',
      subtitle: 'Use the 6-digit code we sent to ${widget.email}.',
      primaryAction: FilledButton(
        onPressed: _loading ? null : _submit,
        child: _loading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : const Text('Reset password'),
      ),
      children: [
        Form(
          key: _form,
          child: Column(
            children: [
              GenieErrorText(_error),
              GField(label: 'Reset code', controller: _code, validator: Validators.otp),
              GPasswordField(
                  label: 'New password', controller: _password, validator: Validators.password),
            ],
          ),
        ),
      ],
    );
  }
}
