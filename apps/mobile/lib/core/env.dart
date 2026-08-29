/// Compile-time configuration. Pass with:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8787
class Env {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8787',
  );

  static const String appEnv = String.fromEnvironment(
    'APP_ENV',
    defaultValue: 'local',
  );

  static bool get isProd => appEnv == 'production';
}
