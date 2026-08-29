import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_controller.dart';
import '../features/auth/presentation/forgot_password_screen.dart';
import '../features/auth/presentation/onboarding_screen.dart';
import '../features/auth/presentation/reset_password_screen.dart';
import '../features/auth/presentation/role_pick_screen.dart';
import '../features/auth/presentation/sign_in_screen.dart';
import '../features/auth/presentation/sign_up_celebrant_screen.dart';
import '../features/auth/presentation/sign_up_merchant_screen.dart';
import '../features/auth/presentation/verify_otp_screen.dart';
import '../features/home/home_shell.dart';
import '../features/settings/placeholder_screens.dart';

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: _AuthListenable(ref),
    redirect: (context, state) {
      final status = auth.status;
      final loc = state.matchedLocation;

      if (status == AuthStatus.unknown) return loc == '/splash' ? null : '/splash';

      final onAuthFlow = loc.startsWith('/auth') || loc == '/onboarding';
      if (status == AuthStatus.unauthenticated) {
        return onAuthFlow ? null : '/onboarding';
      }
      // authenticated
      if (onAuthFlow || loc == '/splash') return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const _SplashScreen()),
      GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: '/auth/role', builder: (_, __) => const RolePickScreen()),
      GoRoute(path: '/auth/sign-in', builder: (_, __) => const SignInScreen()),
      GoRoute(
          path: '/auth/sign-up/celebrant', builder: (_, __) => const SignUpCelebrantScreen()),
      GoRoute(path: '/auth/sign-up/merchant', builder: (_, __) => const SignUpMerchantScreen()),
      GoRoute(
        path: '/auth/verify',
        builder: (_, s) => VerifyOtpScreen(email: s.uri.queryParameters['email'] ?? ''),
      ),
      GoRoute(path: '/auth/forgot', builder: (_, __) => const ForgotPasswordScreen()),
      GoRoute(
        path: '/auth/reset',
        builder: (_, s) => ResetPasswordScreen(email: s.uri.queryParameters['email'] ?? ''),
      ),
      GoRoute(path: '/', builder: (_, __) => const HomeShell()),
      GoRoute(
        path: '/settings/username',
        builder: (_, __) => const SettingsPlaceholderScreen(
            title: 'Edit username', body: 'Only your username can be changed (US "Profile settings").'),
      ),
      GoRoute(
        path: '/settings/password',
        builder: (_, __) => const SettingsPlaceholderScreen(
            title: 'Change password', body: 'Enter your current and new password.'),
      ),
      GoRoute(
        path: '/settings/delete',
        builder: (_, __) => const SettingsPlaceholderScreen(
            title: 'Delete account',
            body:
                'We will email you a code to confirm. Your transaction history is retained; withdraw any wallet balance first.'),
      ),
    ],
  );
});

/// Bridges Riverpod state changes to GoRouter's Listenable-based refresh.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }
}
