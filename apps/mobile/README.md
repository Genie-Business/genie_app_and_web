# genie — Flutter app

Milestone 1: onboarding + full auth (register, email OTP, login, biometric
unlock, password reset) wired to `@genie/api`. Home is a placeholder shell.

## Prerequisites

- Flutter SDK (stable channel, Dart ≥ 3.4) — not installed in the environment
  that scaffolded this; install from https://docs.flutter.dev/get-started.
- The genie API running locally (`npm run dev --workspace @genie/api`).

## Run

```bash
cd apps/mobile
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # (only if you add generated models)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8787   # Android emulator
flutter run --dart-define=API_BASE_URL=http://localhost:8787  # iOS simulator
```

`10.0.2.2` is the Android emulator's alias for the host machine's `localhost`.

## Checks

```bash
flutter analyze
flutter test
```

## Platform folders

`android/`, `ios/`, `web/` etc. are **not** committed — run
`flutter create --org co.genieapps --project-name genie .` once inside
`apps/mobile` to generate them (it keeps the existing `lib/`, `pubspec.yaml`
and `test/`). Then add the `local_auth` and `flutter_secure_storage` platform
setup from their package READMEs (FaceID usage string on iOS, `FragmentActivity`
on Android).

## Structure

```
lib/
  main.dart
  app/            app.dart (MaterialApp.router), router.dart (GoRouter + auth redirect)
  core/           env.dart, api_client.dart (Dio + refresh interceptor), secure_store.dart
  theme/          genie_theme.dart  (mirrors packages/config design tokens)
  features/
    auth/         models, validators (mirror @genie/contracts), repository, controller,
                  presentation/ (onboarding, role pick, sign-up ×2, verify OTP, sign-in,
                  forgot/reset password)
    home/         home_shell.dart (bottom-nav shell; celebrant vs merchant tabs)
    settings/     placeholder_screens.dart
```
