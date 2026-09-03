export const site = {
  name: 'genie',
  tagline: 'Gifts they actually want.',
  description:
    'genie is the Nigerian gifting app. Build a wishlist of real products for your birthday, wedding or baby shower, share one link, and let friends send exactly what you want — openly or as an anonymous surprise revealed only when it arrives.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787',
  email: 'hello@genieapps.co',
  social: {
    instagram: 'https://instagram.com/genieapp',
    x: 'https://x.com/genieapp',
    tiktok: 'https://tiktok.com/@genieapp',
  },
};

export const faqs = [
  {
    q: 'What exactly is genie?',
    a: 'A gifting app for Nigeria. You create an occasion — birthday, wedding, baby shower, anything — fill a wishlist with real products from genie merchants, and share one link. Friends open it and send you the gifts, delivered to your door.',
  },
  {
    q: 'How do anonymous gifts work?',
    a: "A friend can send a gift without their name on it. You'll see that a secret gift is on the way, but not who it's from — until it physically arrives, when genie reveals the sender and their message.",
  },
  {
    q: 'Do my friends need the app to gift me?',
    a: 'No. They can open your wishlist link in any browser, pick something, and pay by bank transfer as a guest. The app just makes it faster and unlocks anonymous gifts and your own wishlist.',
  },
  {
    q: 'How are payments handled?',
    a: 'Everything is in Naira. Gifts are paid by bank transfer or from your genie wallet. Merchants are settled to their bank account automatically after each delivery.',
  },
  {
    q: 'Can I sell on genie?',
    a: 'Yes. List your products or services, manage stock and orders in the app, and get paid to your bank account after every delivery. Join the waitlist and choose “I want to sell”.',
  },
  {
    q: 'When can I download it?',
    a: 'Very soon — genie is in final testing for the App Store and Play Store. Join the waitlist and we’ll email you the moment it’s live.',
  },
];
