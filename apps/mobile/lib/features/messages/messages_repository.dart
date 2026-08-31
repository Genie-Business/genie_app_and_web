import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class MessageUser {
  const MessageUser({required this.userId, required this.firstName, required this.lastName, required this.username});
  final String userId;
  final String firstName;
  final String lastName;
  final String username;

  String get displayName {
    final n = '$firstName $lastName'.trim();
    return n.isEmpty ? '@$username' : n;
  }

  factory MessageUser.fromJson(Map<String, dynamic> j) => MessageUser(
        userId: j['userId'] as String,
        firstName: (j['firstName'] as String?) ?? '',
        lastName: (j['lastName'] as String?) ?? '',
        username: (j['username'] as String?) ?? '',
      );
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.mine,
    required this.body,
    required this.read,
    required this.createdAt,
  });
  final String id;
  final bool mine;
  final String body;
  final bool read;
  final String createdAt;

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: j['id'] as String,
        mine: j['mine'] as bool? ?? false,
        body: (j['body'] as String?) ?? '',
        read: j['read'] as bool? ?? false,
        createdAt: j['createdAt'] as String,
      );
}

class MessageThread {
  const MessageThread({
    required this.id,
    required this.withUser,
    required this.lastMessage,
    required this.lastMessageAt,
    required this.unreadCount,
    this.messages = const [],
  });
  final String id;
  final MessageUser withUser;
  final String? lastMessage;
  final String lastMessageAt;
  final int unreadCount;
  final List<ChatMessage> messages;

  factory MessageThread.fromJson(Map<String, dynamic> j) => MessageThread(
        id: j['id'] as String,
        withUser: MessageUser.fromJson(j['withUser'] as Map<String, dynamic>),
        lastMessage: j['lastMessage'] as String?,
        lastMessageAt: (j['lastMessageAt'] ?? DateTime.now().toIso8601String()) as String,
        unreadCount: (j['unreadCount'] as num?)?.toInt() ?? 0,
        messages: ((j['messages'] as List?) ?? const [])
            .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class MessagesRepository {
  MessagesRepository(this._api);
  final ApiClient _api;

  Future<List<MessageThread>> threads() async {
    final res = await _api.getPaged<List<dynamic>>('/v1/messages/threads', query: {'pageSize': 50});
    return res.data.map((e) => MessageThread.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<MessageThread> thread(String id) async =>
      MessageThread.fromJson(await _api.get<Map<String, dynamic>>('/v1/messages/threads/$id'));

  Future<MessageThread> startWith({String? username, String? userId}) async {
    final data = await _api.post<Map<String, dynamic>>('/v1/messages/threads', body: {
      if (username != null) 'username': username,
      if (userId != null) 'userId': userId,
    });
    return MessageThread.fromJson(data);
  }

  Future<MessageThread> send(String threadId, String body) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/v1/messages/threads/$threadId/messages',
      body: {'body': body},
    );
    return MessageThread.fromJson(data);
  }

  Future<void> markRead(String threadId) =>
      _api.post<Map<String, dynamic>>('/v1/messages/threads/$threadId/read');

  Future<int> unreadCount() async {
    final data = await _api.get<Map<String, dynamic>>('/v1/messages/unread-count');
    return (data['count'] as num?)?.toInt() ?? 0;
  }
}

final messagesRepositoryProvider =
    Provider<MessagesRepository>((ref) => MessagesRepository(ref.watch(apiClientProvider)));

final messageThreadsProvider =
    FutureProvider<List<MessageThread>>((ref) => ref.watch(messagesRepositoryProvider).threads());

final messageThreadProvider = FutureProvider.family<MessageThread, String>(
    (ref, id) => ref.watch(messagesRepositoryProvider).thread(id));

final messagesUnreadProvider =
    FutureProvider<int>((ref) => ref.watch(messagesRepositoryProvider).unreadCount());
