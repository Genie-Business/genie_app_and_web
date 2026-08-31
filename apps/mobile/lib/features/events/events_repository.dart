import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'event_models.dart';

class EventsRepository {
  EventsRepository(this._api);
  final ApiClient _api;

  Future<List<Event>> list() async {
    final data = await _api.get<List<dynamic>>('/v1/events');
    return data.map((e) => Event.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Event> get(String id) async {
    final data = await _api.get<Map<String, dynamic>>('/v1/events/$id');
    return Event.fromJson(data);
  }

  Future<Event> create({
    required String type,
    required String name,
    required DateTime eventDate,
    String? deliveryAddress,
    String? wishlistName,
  }) async {
    final data = await _api.post<Map<String, dynamic>>('/v1/events', body: {
      'type': type,
      'name': name,
      'eventDate': eventDate.toUtc().toIso8601String(),
      if (deliveryAddress != null && deliveryAddress.trim().isNotEmpty)
        'deliveryAddress': deliveryAddress.trim(),
      if (wishlistName != null && wishlistName.trim().isNotEmpty)
        'wishlistName': wishlistName.trim(),
    });
    return Event.fromJson(data);
  }

  Future<Event> update(String id, Map<String, dynamic> patch) async {
    final data = await _api.patch<Map<String, dynamic>>('/v1/events/$id', body: patch);
    return Event.fromJson(data);
  }

  Future<void> delete(String id) => _api.delete<Map<String, dynamic>>('/v1/events/$id');
}

final eventsRepositoryProvider =
    Provider<EventsRepository>((ref) => EventsRepository(ref.watch(apiClientProvider)));

/// The celebrant's events. Invalidate after create / edit / delete.
final eventsListProvider =
    FutureProvider<List<Event>>((ref) => ref.watch(eventsRepositoryProvider).list());

final eventProvider = FutureProvider.family<Event, String>(
    (ref, id) => ref.watch(eventsRepositoryProvider).get(id));
