import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'env.dart';
import 'secure_store.dart';

/// Thrown for any non-2xx API response, carrying the server's error envelope.
class ApiException implements Exception {
  ApiException(this.code, this.message, {this.statusCode, this.details});
  final String code;
  final String message;
  final int? statusCode;
  final List<({String path, String message})>? details;

  @override
  String toString() => 'ApiException($code, $message)';
}

typedef TokenRefresher = Future<bool> Function();

class ApiClient {
  ApiClient(this._store, {Dio? dio}) : _dio = dio ?? Dio() {
    _dio.options
      ..baseUrl = Env.apiBaseUrl
      ..connectTimeout = const Duration(seconds: 15)
      ..receiveTimeout = const Duration(seconds: 20)
      ..headers['content-type'] = 'application/json';

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (options.extra['auth'] != false) {
            final token = await _store.accessToken;
            if (token != null) options.headers['authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (e, handler) async {
          final isAuthCall = e.requestOptions.path.startsWith('/v1/auth/');
          if (e.response?.statusCode == 401 && !isAuthCall && onRefreshNeeded != null) {
            final ok = await _refreshOnce();
            if (ok) {
              try {
                final clone = await _retry(e.requestOptions);
                return handler.resolve(clone);
              } catch (_) {/* fall through */}
            }
          }
          handler.next(e);
        },
      ),
    );
  }

  final Dio _dio;
  final SecureStore _store;

  /// Set by AuthController — refreshes tokens using the stored refresh token.
  TokenRefresher? onRefreshNeeded;
  Future<bool>? _inFlightRefresh;

  Future<bool> _refreshOnce() {
    return _inFlightRefresh ??= () async {
      try {
        return await onRefreshNeeded!.call();
      } finally {
        _inFlightRefresh = null;
      }
    }();
  }

  Future<Response<dynamic>> _retry(RequestOptions ro) {
    return _dio.request<dynamic>(
      ro.path,
      data: ro.data,
      queryParameters: ro.queryParameters,
      options: Options(method: ro.method, headers: ro.headers, extra: ro.extra),
    );
  }

  Future<T> _unwrap<T>(Future<Response<dynamic>> future) async {
    try {
      final res = await future;
      final body = res.data;
      if (body is Map<String, dynamic> && body.containsKey('data')) {
        return body['data'] as T;
      }
      return body as T;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map<String, dynamic> && data['error'] is Map) {
        final err = data['error'] as Map<dynamic, dynamic>;
        throw ApiException(
          (err['code'] ?? 'error').toString(),
          (err['message'] ?? 'Something went wrong.').toString(),
          statusCode: e.response?.statusCode,
        );
      }
      throw ApiException(
        'network_error',
        e.type == DioExceptionType.connectionError
            ? 'Could not reach genie. Check your connection.'
            : (e.message ?? 'Network error'),
        statusCode: e.response?.statusCode,
      );
    }
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query, bool auth = true}) =>
      _unwrap<T>(_dio.get(path, queryParameters: query, options: Options(extra: {'auth': auth})));

  Future<T> post<T>(String path, {Object? body, bool auth = true}) =>
      _unwrap<T>(_dio.post(path, data: body, options: Options(extra: {'auth': auth})));

  Future<T> patch<T>(String path, {Object? body, bool auth = true}) =>
      _unwrap<T>(_dio.patch(path, data: body, options: Options(extra: {'auth': auth})));

  Future<T> delete<T>(String path, {Object? body, bool auth = true}) =>
      _unwrap<T>(_dio.delete(path, data: body, options: Options(extra: {'auth': auth})));
}

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.watch(secureStoreProvider));
});
