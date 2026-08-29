import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../auth_controller.dart';
import '../validators.dart';
import 'widgets.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _State();
}

class _State extends ConsumerState<SignInScreen> {
  final _form = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ref
          .read(authControllerProvider.notifier)
          .login(identifier: _identifier.text.trim(), password: _password.text);
      // Router redirects on auth state change.
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final biometricAvailable = ref.watch(authControllerProvider).biometricAvailable;

    return GenieFormScaffold(
      title: 'Welcome back',
      subtitle: 'Sign in to manage your events and wishlists.',
      primaryAction: Column(
        children: [
          FilledButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Sign in'),
          ),
          if (biometricAvailable)
            TextButton.icon(
              onPressed: () => ref.read(authControllerProvider.notifier).bootstrap(),
              icon: const Icon(Icons.fingerprint),
              label: const Text('Unlock with Face ID / fingerprint'),
            ),
        ],
      ),
      children: [
        Form(
          key: _form,
          child: Column(
            children: [
              GenieErrorText(_error),
              GField(
                  label: 'Email or username',
                  controller: _identifier,
                  validator: (v) => Validators.required(v, 'Email or username')),
              GPasswordField(
                  label: 'Password',
                  controller: _password,
                  validator: (v) => Validators.required(v, 'Password')),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => context.push('/auth/forgot'),
                  child: const Text('Forgot password?'),
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => context.go('/auth/role'),
                child: const Text('New to genie? Create an account'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
