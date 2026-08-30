# genie — Flutter app

The consumer app. Currently implements onboarding + the full auth flow
(register → email OTP → login → biometric unlock → password reset) wired to
`@genie/api`; the home screen is a placeholder shell. Everything else (events,
wishlists, gifting, cart, friends, messaging, …) is built on the API and is the
next batch of screen work.

---

## 1. One-time setup on Windows

### Flutter SDK

1. Download the Windows SDK zip from <https://docs.flutter.dev/get-started/install/windows>
   and extract it to e.g. `C:\src\flutter` (no spaces in the path, not under
   `C:\Program Files`).
2. Add `C:\src\flutter\bin` to your **User** `Path` (Settings → *Edit
   environment variables for your account*).
3. New terminal, then:

   ```bash
   flutter --version
   flutter doctor
   ```

### Android toolchain (for a real phone / emulator)

- Install **Android Studio** (it bundles the Android SDK, platform-tools and an
  emulator). On first launch let it install the SDK + a system image.
- `flutter doctor --android-licenses` → accept all.
- `flutter doctor` should show *Android toolchain* ✓.
- **Java 17** is needed to build the APK. Android Studio ships a JDK; if
  `flutter doctor` complains, point it at it:
  `flutter config --jdk-dir "C:\Program Files\Android\Android Studio\jbr"`.

### VS Code

- Install the **Flutter** extension (it pulls in **Dart**). The repo already
  recommends it (`.vscode/extensions.json`).
- Reload VS Code. The status bar shows a device picker; the Run panel has
  ready-made launch configs (see below).

---

## 2. Generate the native project (first run only)

`android/`, `ios/`, `web/` are **not** committed — they're regenerated. From
`apps/mobile`:

```bash
flutter create --org co.genieapps --project-name genie --platforms=android,ios .
flutter pub get
```

This keeps the existing `lib/`, `pubspec.yaml` and `test/`.

> When you later need to keep native edits (biometric `FlutterFragmentActivity`,
> `Info.plist` camera/FaceID strings, app icon, signing) — un-ignore
> `apps/mobile/android/` in the root `.gitignore` and commit it.

---

## 3. Run it

The API URL is a compile-time constant passed with `--dart-define`. The VS Code
Run panel (`.vscode/launch.json`) has these presets:

| Config | `API_BASE_URL` | Use when |
|---|---|---|
| **genie app · deployed API** | your Vercel URL | phone or emulator, anywhere |
| **genie app · local API (Android emulator)** | `http://10.0.2.2:8787` | emulator + `npm run dev` on this PC |
| **genie app · local API (physical phone on Wi-Fi)** | `http://<your-PC-LAN-IP>:8787` | phone + PC on the same Wi-Fi |

`10.0.2.2` is the Android **emulator's** alias for the host's `localhost`; a
physical phone needs the PC's LAN IP (`ipconfig` → IPv4 address). The dev server
already listens on all interfaces — the first time, Windows will pop a firewall
prompt for `node`; allow it on **Private** networks. Phone and PC must be on the
same Wi-Fi. (A deployed API sidesteps all of this.)

From the CLI instead:

```bash
cd apps/mobile
flutter devices                       # list emulators / plugged-in phones
flutter run --dart-define=API_BASE_URL=https://<your>.vercel.app
```

### Put it on your phone without a cable

Every push to `main` builds a signed-for-testing APK. Open the CI run on GitHub
→ **Artifacts** → `genie-android-apk` → download, unzip, send the `.apk` to your
phone (email / Drive / USB) and open it. Allow *Install unknown apps* for the
app you opened it from.

The APK is built against the `API_BASE_URL` repo variable
(**Settings → Secrets and variables → Actions → Variables**) — set it to the
deployed API URL.

---

## 4. Checks

```bash
cd apps/mobile
flutter analyze
flutter test
```

CI runs both on every push and annotates failures inline.

---

## 5. Structure

```
lib/
  main.dart
  app/         app.dart (MaterialApp.router), router.dart (GoRouter + auth redirect)
  core/        env.dart (API_BASE_URL), api_client.dart (Dio + refresh interceptor),
               secure_store.dart (flutter_secure_storage)
  theme/       genie_theme.dart  (mirrors packages/config design tokens)
  features/
    auth/      models, validators (mirror @genie/contracts), repository, controller,
               presentation/ (onboarding, role pick, sign-up ×2, verify OTP, sign-in,
               forgot/reset password)
    home/      home_shell.dart (bottom-nav shell; celebrant vs merchant tabs)
    settings/  placeholder_screens.dart
```
