/// Compile-time configuration.
///
/// Defaults target the deployed preview API so a plain `flutter build apk` /
/// `flutter run` is phone-ready with no flags. For local API work, use the
/// VS Code launch configs (they pass `--dart-define`), e.g.:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8787 --dart-define=APP_ENV=local
class Env {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://genie-app-and-web-api.vercel.app',
  );

  static const String appEnv = String.fromEnvironment(
    'APP_ENV',
    defaultValue: 'preview',
  );

  static bool get isProd => appEnv == 'production';
}
