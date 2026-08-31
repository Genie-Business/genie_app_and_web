import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../theme/genie_theme.dart';
import '../messages_repository.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.threadId});
  final String threadId;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    // Opening the thread marks incoming messages read server-side.
    Future.microtask(() async {
      try {
        await ref.read(messagesRepositoryProvider).markRead(widget.threadId);
        ref.invalidate(messagesUnreadProvider);
        ref.invalidate(messageThreadsProvider);
      } catch (_) {/* best effort */}
    });
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(messagesRepositoryProvider).send(widget.threadId, text);
      _input.clear();
      ref.invalidate(messageThreadProvider(widget.threadId));
      ref.invalidate(messageThreadsProvider);
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
    final thread = ref.watch(messageThreadProvider(widget.threadId));

    return Scaffold(
      appBar: AppBar(
        title: Text(thread.asData?.value.withUser.displayName ?? 'Chat'),
      ),
      body: Column(
        children: [
          Expanded(
            child: AsyncView<MessageThread>(
              value: thread,
              onRefresh: () => ref.refresh(messageThreadProvider(widget.threadId).future),
              emptyWhen: (t) => t.messages.isEmpty,
              empty: const EmptyState(
                icon: Icons.waving_hand_outlined,
                title: 'Say hello',
                body: 'Send the first message to start the conversation.',
              ),
              data: (t) {
                final msgs = t.messages;
                return ListView.builder(
                  controller: _scroll,
                  reverse: true,
                  padding: const EdgeInsets.all(16),
                  itemCount: msgs.length,
                  itemBuilder: (_, i) => _Bubble(msgs[msgs.length - 1 - i]),
                );
              },
            ),
          ),
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
                        hintText: 'Message',
                        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      ),
                      onSubmitted: (_) => _send(),
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

class _Bubble extends StatelessWidget {
  const _Bubble(this.msg);
  final ChatMessage msg;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: msg.mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.76),
        decoration: BoxDecoration(
          color: msg.mine ? GenieColors.primary : GenieColors.subtle,
          borderRadius: BorderRadius.circular(16).copyWith(
            bottomRight: msg.mine ? const Radius.circular(4) : null,
            bottomLeft: msg.mine ? null : const Radius.circular(4),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(msg.body,
                style: TextStyle(color: msg.mine ? Colors.white : GenieColors.ink)),
            const SizedBox(height: 2),
            Text(
              formatClock(msg.createdAt),
              style: TextStyle(
                fontSize: 10,
                color: msg.mine ? Colors.white70 : GenieColors.inkMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
