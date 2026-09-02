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
import '../features/activity/activity_screen.dart';
import '../features/catalog/catalog_models.dart';
import '../features/events/presentation/create_event_screen.dart';
import '../features/events/presentation/event_detail_screen.dart';
import '../features/friends/presentation/friends_screen.dart';
import '../features/gifts/presentation/gift_a_friend_screen.dart';
import '../features/gifts/presentation/gifts_received_screen.dart';
import '../features/home/home_shell.dart';
import '../features/kyc/presentation/kyc_screen.dart';
import '../features/merchant/presentation/edit_product_screen.dart';
import '../features/merchant/presentation/payout_account_screen.dart';
import '../features/messages/presentation/chat_screen.dart';
import '../features/messages/presentation/messages_screen.dart';
import '../features/notifications/presentation/notification_settings_screen.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/support/presentation/support_screen.dart';
import '../features/support/presentation/support_thread_screen.dart';
import '../features/settings/presentation/change_password_screen.dart';
import '../features/settings/presentation/delete_account_screen.dart';
import '../features/settings/presentation/edit_username_screen.dart';
import '../features/wallet/presentation/wallet_screen.dart';
import '../features/wishlists/presentation/add_wishlist_item_screen.dart';
import '../features/wishlists/presentation/wishlist_screen.dart';

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

final routerProvider = Provider<GoRouter>((ref) {
  // Build the router once; `refreshListenable` re-runs `redirect` on auth changes
  // and `redirect` reads the current status fresh each time.
  return GoRouter(
    initialLocation: '/',
    refreshListenable: _AuthListenable(ref),
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final status = auth.status;
      final loc = state.matchedLocation;

      if (status == AuthStatus.unknown) return loc == '/splash' ? null : '/splash';

      // A shared wishlist link is viewable without an account (the gift action
      // itself prompts for sign-in).
      final isPublicLink = loc.startsWith('/w/');
      final onAuthFlow = loc.startsWith('/auth') || loc == '/onboarding';
      if (status == AuthStatus.unauthenticated) {
        return (onAuthFlow || isPublicLink) ? null : '/onboarding';
      }

      // Account exists but the email isn't verified — resume sign-up at the
      // code screen. Still let them move around the auth flow (e.g. to sign in
      // as someone else).
      if (status == AuthStatus.pendingVerification) {
        if (loc.startsWith('/auth/verify') || onAuthFlow) return null;
        final email = Uri.encodeComponent(auth.pendingEmail ?? '');
        final code = auth.pendingCode;
        return '/auth/verify?email=$email${code != null ? '&code=$code' : ''}';
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
        builder: (_, s) => VerifyOtpScreen(
          email: s.uri.queryParameters['email'] ?? '',
          prefillCode: s.uri.queryParameters['code'],
        ),
      ),
      GoRoute(path: '/auth/forgot', builder: (_, __) => const ForgotPasswordScreen()),
      GoRoute(
        path: '/auth/reset',
        builder: (_, s) => ResetPasswordScreen(email: s.uri.queryParameters['email'] ?? ''),
      ),
      GoRoute(path: '/', builder: (_, __) => const HomeShell()),
      GoRoute(path: '/events/new', builder: (_, __) => const CreateEventScreen()),
      GoRoute(
        path: '/events/:id',
        builder: (_, s) => EventDetailScreen(eventId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: '/wishlists/:id',
        builder: (_, s) => WishlistScreen(wishlistId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: '/wishlists/:id/add',
        builder: (_, s) => AddWishlistItemScreen(wishlistId: s.pathParameters['id']!),
      ),
      GoRoute(path: '/wallet', builder: (_, __) => const WalletScreen()),
      GoRoute(
        path: '/gift',
        builder: (_, s) => GiftAFriendScreen(initialLink: s.uri.queryParameters['link']),
      ),
      // Shared wishlist deep link (genie://w/<id> or https://…/w/<id>).
      GoRoute(
        path: '/w/:id',
        builder: (_, s) => GiftAFriendScreen(initialLink: s.pathParameters['id']),
      ),
      GoRoute(path: '/gifts/received', builder: (_, __) => const GiftsReceivedScreen()),
      GoRoute(
        path: '/merchant/products/new',
        builder: (_, __) => const EditProductScreen(),
      ),
      GoRoute(
        path: '/merchant/products/:id',
        builder: (_, s) => EditProductScreen(existing: s.extra as Product?),
      ),
      GoRoute(path: '/settings/username', builder: (_, __) => const EditUsernameScreen()),
      GoRoute(path: '/settings/password', builder: (_, __) => const ChangePasswordScreen()),
      GoRoute(path: '/settings/delete', builder: (_, __) => const DeleteAccountScreen()),
      GoRoute(
          path: '/settings/notifications',
          builder: (_, __) => const NotificationSettingsScreen()),
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/activity', builder: (_, __) => const ActivityScreen()),
      GoRoute(path: '/friends', builder: (_, __) => const FriendsScreen()),
      GoRoute(path: '/kyc', builder: (_, __) => const KycScreen()),
      GoRoute(path: '/messages', builder: (_, __) => const MessagesScreen()),
      GoRoute(
        path: '/messages/:id',
        builder: (_, s) => ChatScreen(threadId: s.pathParameters['id']!),
      ),
      GoRoute(path: '/support', builder: (_, __) => const SupportScreen()),
      GoRoute(path: '/support/new', builder: (_, __) => const NewSupportRequestScreen()),
      GoRoute(
        path: '/support/:id',
        builder: (_, s) => SupportThreadScreen(threadId: s.pathParameters['id']!),
      ),
      GoRoute(path: '/merchant/payout', builder: (_, __) => const PayoutAccountScreen()),
    ],
  );
});

/// Bridges Riverpod state changes to GoRouter's Listenable-based refresh.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }
}
