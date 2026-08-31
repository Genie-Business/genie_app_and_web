import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class SupportMessage {
  const SupportMessage({required this.id, required this.fromAgent, required this.body, required this.createdAt});
  final String id;
  final bool fromAgent;
  final String body;
  final String createdAt;

  factory SupportMessage.fromJson(Map<String, dynamic> j) => SupportMessage(
        id: j['id'] as String,
        fromAgent: (j['from'] as String?) == 'AGENT',
        body: (j['body'] as String?) ?? '',
        createdAt: j['createdAt'] as String,
      );
}

class SupportThread {
  const SupportThread({
    required this.id,
    required this.status,
    required this.messageCount,
    required this.lastMessageAt,
    this.subject,
    this.messages = const [],
  });
  final String id;
  final String status; // OPEN · PENDING · RESOLVED · CLOSED
  final int messageCount;
  final String lastMessageAt;
  final String? subject;
  final List<SupportMessage> messages;

  bool get isClosed => status == 'RESOLVED' || status == 'CLOSED';

  factory SupportThread.fromJson(Map<String, dynamic> j) => SupportThread(
        id: j['id'] as String,
        status: (j['status'] as String?) ?? 'OPEN',
        messageCount: (j['messageCount'] as num?)?.toInt() ?? 0,
        lastMessageAt: (j['lastMessageAt'] ?? j['createdAt'] ?? DateTime.now().toIso8601String()) as String,
        subject: j['subject'] as String?,
        messages: ((j['messages'] as List?) ?? const [])
            .map((e) => SupportMessage.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class SupportRepository {
  SupportRepository(this._api);
  final ApiClient _api;

  Future<List<SupportThread>> threads() async {
    final data = await _api.get<List<dynamic>>('/v1/support/threads');
    return data.map((e) => SupportThread.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<SupportThread> thread(String id) async =>
      SupportThread.fromJson(await _api.get<Map<String, dynamic>>('/v1/support/threads/$id'));

  Future<SupportThread> create({String? subject, required String message}) async {
    final data = await _api.post<Map<String, dynamic>>('/v1/support/threads', body: {
      if (subject != null && subject.trim().isNotEmpty) 'subject': subject.trim(),
      'message': message.trim(),
    });
    return SupportThread.fromJson(data);
  }

  Future<SupportThread> reply(String id, String message) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/v1/support/threads/$id/messages',
      body: {'message': message.trim()},
    );
    return SupportThread.fromJson(data);
  }
}

final supportRepositoryProvider =
    Provider<SupportRepository>((ref) => SupportRepository(ref.watch(apiClientProvider)));

final supportThreadsProvider =
    FutureProvider<List<SupportThread>>((ref) => ref.watch(supportRepositoryProvider).threads());

final supportThreadProvider = FutureProvider.family<SupportThread, String>(
    (ref, id) => ref.watch(supportRepositoryProvider).thread(id));
