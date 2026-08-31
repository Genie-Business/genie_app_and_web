import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../../../theme/genie_theme.dart';
import '../support_repository.dart';

class SupportScreen extends ConsumerWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final threads = ref.watch(supportThreadsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Help & support')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/support/new'),
        icon: const Icon(Icons.add_comment_outlined),
        label: const Text('New request'),
      ),
      body: AsyncView<List<SupportThread>>(
        value: threads,
        onRefresh: () => ref.refresh(supportThreadsProvider.future),
        emptyWhen: (l) => l.isEmpty,
        empty: EmptyState(
          icon: Icons.support_agent_rounded,
          title: 'How can we help?',
          body: 'Start a conversation and the genie team will get back to you.',
          action: FilledButton(
            onPressed: () => context.push('/support/new'),
            child: const Text('Talk to us'),
          ),
        ),
        data: (list) => ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: list.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (_, i) {
            final t = list[i];
            return ListTile(
              title: Text(t.subject ?? 'Support request',
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text('${t.messageCount} message${t.messageCount == 1 ? '' : 's'} · '
                  'updated ${relativeDay(t.lastMessageAt)}'),
              trailing: _StatusChip(t.status),
              onTap: () async {
                await context.push('/support/${t.id}');
                ref.invalidate(supportThreadsProvider);
              },
            );
          },
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    final resolved = status == 'RESOLVED' || status == 'CLOSED';
    final c = resolved ? GenieColors.inkMuted : GenieColors.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(status[0] + status.substring(1).toLowerCase(),
          style: TextStyle(fontSize: 11, color: c, fontWeight: FontWeight.w600)),
    );
  }
}

/// Compose a new support request.
class NewSupportRequestScreen extends ConsumerStatefulWidget {
  const NewSupportRequestScreen({super.key});

  @override
  ConsumerState<NewSupportRequestScreen> createState() => _NewSupportRequestScreenState();
}

class _NewSupportRequestScreenState extends ConsumerState<NewSupportRequestScreen> {
  final _subject = TextEditingController();
  final _message = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (_message.text.trim().isEmpty) {
      setState(() => _error = 'Tell us what you need help with.');
      return;
    }
    setState(() => _loading = true);
    try {
      final t = await ref
          .read(supportRepositoryProvider)
          .create(subject: _subject.text, message: _message.text);
      ref.invalidate(supportThreadsProvider);
      if (mounted) context.pushReplacement('/support/${t.id}');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GenieFormScaffold(
      title: 'Talk to us',
      subtitle: 'Describe the problem and we\'ll reply here and by email.',
      primaryAction: FilledButton(
        onPressed: _loading ? null : _submit,
        child: _loading
            ? const SizedBox(
                height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : const Text('Send'),
      ),
      children: [
        GenieErrorText(_error),
        TextField(
          controller: _subject,
          decoration: const InputDecoration(labelText: 'Subject (optional)'),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _message,
          minLines: 4,
          maxLines: 8,
          decoration: const InputDecoration(
            labelText: 'How can we help?',
            alignLabelWithHint: true,
          ),
        ),
      ],
    );
  }
}
