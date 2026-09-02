import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:go_router/go_router.dart';

/// Turns an incoming deep link into an in-app route.
///
///  * `genie://w/<id>`                         → `/w/<id>`
///  * `https://<landing>/w/<id>`               → `/w/<id>`
///  * `genie://join?ref=CODE` / `.../join?...` → `/auth/role`
String? routeForUri(Uri uri) {
  // Custom scheme: genie://w/<id>  → host="w", first segment = id
  // https link:    /w/<id>        → first segment "w", second = id
  final segs = [
    if (uri.scheme == 'genie' && uri.host.isNotEmpty) uri.host,
    ...uri.pathSegments,
  ].where((s) => s.isNotEmpty).toList();

  if (segs.isEmpty) return null;
  if (segs.first == 'w' && segs.length >= 2) return '/w/${segs[1]}';
  if (segs.first == 'join') return '/auth/role';
  return null;
}

/// Listens for deep links for the life of the app and pushes them onto [router].
class DeepLinkService {
  DeepLinkService(this._router);
  final GoRouter _router;
  final _appLinks = AppLinks();
  StreamSubscription<Uri>? _sub;

  Future<void> start() async {
    // A link that launched the app cold.
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) _handle(initial);
    } catch (_) {/* ignore */}

    // Links while the app is running / backgrounded.
    _sub = _appLinks.uriLinkStream.listen(_handle, onError: (_) {});
  }

  void _handle(Uri uri) {
    final route = routeForUri(uri);
    if (route != null) _router.push(route);
  }

  void dispose() {
    _sub?.cancel();
  }
}
