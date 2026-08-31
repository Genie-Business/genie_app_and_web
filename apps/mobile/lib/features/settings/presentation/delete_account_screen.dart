import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pinput/pinput.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../../../theme/genie_theme.dart';
import '../../auth/auth_controller.dart';
import '../settings_repository.dart';

class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});
  @override
  ConsumerState<DeleteAccountScreen> createState() => _State();
}

class _State extends ConsumerState<DeleteAccountScreen> {
  final _pin = TextEditingController();
  bool _codeSent = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final code = await ref.read(settingsRepositoryProvider).requestDeletion();
      setState(() {
        _codeSent = true;
        if (code != null && code.length == 6) _pin.text = code;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirm() async {
    if (_pin.text.trim().length != 6) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(settingsRepositoryProvider).confirmDeletion(_pin.text.trim());
      await ref.read(authControllerProvider.notifier).logout();
      if (mounted) context.go('/onboarding');
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return GenieFormScaffold(
      title: 'Delete account',
      subtitle:
          'Withdraw any wallet balance first. Your transaction history is kept, but your profile and wishlists are permanently removed.',
      primaryAction: _codeSent
          ? FilledButton(
              style: FilledButton.styleFrom(backgroundColor: GenieColors.error),
              onPressed: _loading ? null : _confirm,
              child: _loading
                  ? const SizedBox(
                      height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Permanently delete'),
            )
          : OutlinedButton(
              onPressed: _loading ? null : _requestCode,
              child: _loading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Email me a confirmation code'),
            ),
      children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error!, style: const TextStyle(color: GenieColors.error)),
          ),
        if (_codeSent) ...[
          const Text('Enter the 6-digit code we sent to your email.'),
          const SizedBox(height: 12),
          Pinput(length: 6, controller: _pin),
        ],
      ],
    );
  }
}
