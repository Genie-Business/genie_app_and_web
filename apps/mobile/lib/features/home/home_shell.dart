import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../theme/genie_theme.dart';
import '../auth/auth_controller.dart';
import '../auth/models.dart';

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
            _Placeholder(icon: Icons.inventory_2_rounded, title: 'Products & services', body: 'Add and manage your catalogue.'),
            _Placeholder(icon: Icons.receipt_long_rounded, title: 'Orders', body: 'Gift orders from genie users will show here.'),
          ]
        : const [
            _Placeholder(icon: Icons.event_rounded, title: 'Events', body: 'Create an event to start a wishlist.'),
            _Placeholder(icon: Icons.card_giftcard_rounded, title: 'Wishlists', body: 'Your open wishlists will appear here.'),
          ];

    final destinations = isMerchant
        ? const [
            NavigationDestination(icon: Icon(Icons.inventory_2_outlined), label: 'Products'),
            NavigationDestination(icon: Icon(Icons.receipt_long_outlined), label: 'Orders'),
            NavigationDestination(icon: Icon(Icons.person_outline), label: 'Account'),
          ]
        : const [
            NavigationDestination(icon: Icon(Icons.event_outlined), label: 'Events'),
            NavigationDestination(icon: Icon(Icons.card_giftcard_outlined), label: 'Wishlists'),
            NavigationDestination(icon: Icon(Icons.person_outline), label: 'Account'),
          ];

    final body = _index < tabs.length ? tabs[_index] : _AccountTab(user: user);

    return Scaffold(
      appBar: AppBar(
        title: Text('genie', style: GenieTheme.display(20).copyWith(color: GenieColors.primary)),
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

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: GenieColors.primary),
            const SizedBox(height: 16),
            Text(title, style: GenieTheme.display(20)),
            const SizedBox(height: 8),
            Text(body,
                textAlign: TextAlign.center,
                style: const TextStyle(color: GenieColors.inkSecondary)),
            const SizedBox(height: 24),
            const Chip(label: Text('Coming soon')),
          ],
        ),
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
          leading: const Icon(Icons.lock_outline),
          title: const Text('Change password'),
          onTap: () => context.push('/settings/password'),
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
}
