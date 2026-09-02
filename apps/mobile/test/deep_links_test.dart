import 'package:flutter_test/flutter_test.dart';
import 'package:genie/core/deep_links.dart';

void main() {
  group('routeForUri', () {
    test('custom scheme genie://w/<id>', () {
      expect(routeForUri(Uri.parse('genie://w/abc123')), '/w/abc123');
    });

    test('https universal link', () {
      expect(
        routeForUri(Uri.parse('https://genie-app-and-web-landing.vercel.app/w/xyz789')),
        '/w/xyz789',
      );
    });

    test('join link routes to role picker', () {
      expect(routeForUri(Uri.parse('genie://join?ref=GEN123')), '/auth/role');
      expect(
        routeForUri(Uri.parse('https://genie-app-and-web-landing.vercel.app/join?ref=GEN123')),
        '/auth/role',
      );
    });

    test('unknown links are ignored', () {
      expect(routeForUri(Uri.parse('https://genie-app-and-web-landing.vercel.app/privacy')), isNull);
      expect(routeForUri(Uri.parse('genie://')), isNull);
      expect(routeForUri(Uri.parse('genie://w')), isNull);
    });
  });
}
