import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../support_repository.dart';

class SupportThreadScreen extends ConsumerStatefulWidget {
  const SupportThreadScreen({super.key, required this.threadId});
  final String threadId;

  @override
  ConsumerState<SupportThreadScreen> createState() => _SupportThreadScreenState();
}

class _SupportThreadScreenState extends ConsumerState<SupportThreadScreen> {
  final _input = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(supportRepositoryProvider).reply(widget.threadId, text);
      _input.clear();
      ref.invalidate(supportThreadProvider(widget.threadId));
      ref.invalidate(supportThreadsProvider);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final thread = ref.watch(supportThreadProvider(widget.threadId));

    return Scaffold(
      appBar: AppBar(title: Text(thread.asData?.value.subject ?? 'Support')),
      body: Column(
        children: [
          Expanded(
            child: AsyncView<SupportThread>(
              value: thread,
              onRefresh: () => ref.refresh(supportThreadProvider(widget.threadId).future),
              data: (t) => ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  for (final m in t.messages) _MessageRow(m),
                  if (t.isClosed)
                    const Padding(
                      padding: EdgeInsets.only(top: 12),
                      child: Center(
                        child: Text('This request has been resolved.',
                            style: TextStyle(color: GenieColors.inkMuted, fontSize: 12)),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (!(thread.asData?.value.isClosed ?? false))
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _input,
                        minLines: 1,
                        maxLines: 4,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(
                          hintText: 'Reply',
                          contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: _sending ? null : _send,
                      icon: const Icon(Icons.send),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MessageRow extends StatelessWidget {
  const _MessageRow(this.msg);
  final SupportMessage msg;

  @override
  Widget build(BuildContext context) {
    final agent = msg.fromAgent;
    return Align(
      alignment: agent ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        decoration: BoxDecoration(
          color: agent ? GenieColors.subtle : GenieColors.primary,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(agent ? 'genie support' : 'You',
                style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: agent ? GenieColors.inkMuted : Colors.white70)),
            const SizedBox(height: 3),
            Text(msg.body, style: TextStyle(color: agent ? GenieColors.ink : Colors.white)),
            const SizedBox(height: 3),
            Text(chatTimestamp(msg.createdAt),
                style: TextStyle(
                    fontSize: 10, color: agent ? GenieColors.inkMuted : Colors.white70)),
          ],
        ),
      ),
    );
  }
}
