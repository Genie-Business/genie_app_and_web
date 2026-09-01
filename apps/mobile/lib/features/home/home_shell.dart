import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../shared/widgets/genie_mark.dart';
import '../../theme/genie_theme.dart';
import '../auth/auth_controller.dart';
import '../auth/models.dart';
import '../events/presentation/events_screen.dart';
import '../merchant/presentation/merchant_orders_screen.dart';
import '../merchant/presentation/merchant_products_screen.dart';
import '../messages/messages_repository.dart';
import '../notifications/notifications_repository.dart';
import '../wishlists/presentation/wishlists_tab_screen.dart';
import 'presentation/home_dashboard_screen.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).user;
    final isMerchant = user?.isMerchant ?? false;

    final tabs = isMerchant
        ? const [
            MerchantProductsScreen(),
            MerchantOrdersScreen(),
          ]
        : const [
            HomeDashboardScreen(),
            EventsScreen(),
            WishlistsTabScreen(),
          ];

    final destinations = isMerchant
        ? const [
            NavigationDestination(icon: Icon(Icons.inventory_2_outlined), label: 'Products'),
            NavigationDestination(icon: Icon(Icons.receipt_long_outlined), label: 'Orders'),
            NavigationDestination(icon: Icon(Icons.person_outline), label: 'Account'),
          ]
        : const [
            NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.event_outlined), label: 'Events'),
            NavigationDestination(icon: Icon(Icons.card_giftcard_outlined), label: 'Wishlists'),
            NavigationDestination(icon: Icon(Icons.person_outline), label: 'Account'),
          ];

    final body = _index < tabs.length ? tabs[_index] : _AccountTab(user: user);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const GenieMark(size: 22),
            const SizedBox(width: 8),
            Text('genie', style: GenieTheme.display(20).copyWith(color: GenieColors.primary)),
          ],
        ),
        actions: [
          if (!isMerchant)
            Consumer(
              builder: (context, ref, _) {
                final unread = ref.watch(messagesUnreadProvider).maybeWhen(
                      data: (n) => n,
                      orElse: () => 0,
                    );
                return IconButton(
                  icon: Badge(
                    isLabelVisible: unread > 0,
                    label: Text('$unread'),
                    child: const Icon(Icons.forum_outlined),
                  ),
                  tooltip: 'Messages',
                  onPressed: () => context.push('/messages'),
                );
              },
            ),
          Consumer(
            builder: (context, ref, _) {
              final unread = ref.watch(unreadCountProvider).maybeWhen(
                    data: (n) => n,
                    orElse: () => 0,
                  );
              return IconButton(
                icon: Badge(
                  isLabelVisible: unread > 0,
                  label: Text('$unread'),
                  child: const Icon(Icons.notifications_none),
                ),
                tooltip: 'Notifications',
                onPressed: () => context.push('/notifications'),
              );
            },
          ),
        ],
      ),
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: destinations,
      ),
    );
  }
}

class _AccountTab extends ConsumerWidget {
  const _AccountTab({this.user});
  final AuthUser? user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.read(authControllerProvider.notifier);
    final biometricAvailable = ref.watch(authControllerProvider).biometricAvailable;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        ListTile(
          leading: const CircleAvatar(child: Icon(Icons.person)),
          title: Text('${user?.firstName ?? ''} ${user?.lastName ?? ''}'.trim()),
          subtitle: Text(user?.email ?? ''),
        ),
        const Divider(height: 32),
        if (!(user?.isMerchant ?? false)) ...[
          ListTile(
            leading: const Icon(Icons.people_alt_outlined),
            title: const Text('Friends'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/friends'),
          ),
          ListTile(
            leading: const Icon(Icons.forum_outlined),
            title: const Text('Messages'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/messages'),
          ),
          ListTile(
            leading: const Icon(Icons.account_balance_wallet_outlined),
            title: const Text('Wallet'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/wallet'),
          ),
        ],
        if (user?.isMerchant ?? false)
          ListTile(
            leading: const Icon(Icons.account_balance_outlined),
            title: const Text('Settlement account'),
            subtitle: const Text('Where genie pays your sales'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/merchant/payout'),
          ),
        ListTile(
          leading: const Icon(Icons.verified_user_outlined),
          title: const Text('Identity verification'),
          subtitle: Text(_kycLabel(user?.kycLevel1)),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/kyc'),
        ),
        ListTile(
          leading: const Icon(Icons.history),
          title: const Text('Activity'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/activity'),
        ),
        const Divider(height: 32),
        ListTile(
          leading: const Icon(Icons.badge_outlined),
          title: const Text('Username'),
          subtitle: Text('@${user?.username ?? ''}'),
          trailing: const Icon(Icons.edit_outlined),
          onTap: () => context.push('/settings/username'),
        ),
        if (user?.referralCode != null)
          ListTile(
            leading: const Icon(Icons.card_giftcard_outlined),
            title: const Text('Referral code'),
            subtitle: Text(user!.referralCode!),
          ),
        if (biometricAvailable)
          SwitchListTile(
            secondary: const Icon(Icons.fingerprint),
            title: const Text('Biometric unlock'),
            value: false,
            onChanged: (v) async {
              if (v) {
                await auth.enableBiometricUnlock();
              } else {
                await auth.disableBiometricUnlock();
              }
            },
          ),
        ListTile(
          leading: const Icon(Icons.notifications_active_outlined),
          title: const Text('Notification settings'),
          onTap: () => context.push('/settings/notifications'),
        ),
        ListTile(
          leading: const Icon(Icons.lock_outline),
          title: const Text('Change password'),
          onTap: () => context.push('/settings/password'),
        ),
        const Divider(height: 32),
        ListTile(
          leading: const Icon(Icons.support_agent_outlined),
          title: const Text('Help & support'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/support'),
        ),
        ListTile(
          leading: const Icon(Icons.delete_outline, color: GenieColors.error),
          title: const Text('Delete account', style: TextStyle(color: GenieColors.error)),
          onTap: () => context.push('/settings/delete'),
        ),
        const Divider(height: 32),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Sign out'),
          onTap: auth.logout,
        ),
      ],
    );
  }

  static String _kycLabel(String? status) {
    switch (status) {
      case 'APPROVED':
        return 'Verified';
      case 'PENDING':
        return 'Under review';
      case 'REJECTED':
        return 'Action needed';
      default:
        return 'Not verified';
    }
  }
}
