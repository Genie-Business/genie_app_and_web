import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../../auth/auth_controller.dart';
import '../../auth/presentation/widgets.dart';
import '../../auth/validators.dart';
import '../settings_repository.dart';

class EditUsernameScreen extends ConsumerStatefulWidget {
  const EditUsernameScreen({super.key});
  @override
  ConsumerState<EditUsernameScreen> createState() => _State();
}

class _State extends ConsumerState<EditUsernameScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _username;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _username = TextEditingController(
        text: ref.read(authControllerProvider).user?.username ?? '');
  }

  @override
  void dispose() {
    _username.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(settingsRepositoryProvider).changeUsername(_username.text.trim());
      // Refresh the cached user.
      await ref.read(authControllerProvider.notifier).bootstrap();
      messenger.showSnackBar(const SnackBar(content: Text('Username updated')));
      if (mounted) context.pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GenieFormScaffold(
      title: 'Edit username',
      subtitle: 'Friends find and add you by this. Your name and email stay locked.',
      primaryAction: FilledButton(
        onPressed: _loading ? null : _submit,
        child: _loading
            ? const SizedBox(
                height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : const Text('Save'),
      ),
      children: [
        Form(
          key: _form,
          child: Column(
            children: [
              GenieErrorText(_error),
              GField(label: 'Username', controller: _username, validator: Validators.username),
            ],
          ),
        ),
      ],
    );
  }
}
