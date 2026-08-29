export const site = {
  name: 'genie',
  tagline: 'The wishlist app for people who love giving.',
  description:
    'genie lets you create events, build wishlists from real products, and let friends gift exactly what you want — including anonymous gifts revealed only when they arrive.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787',
  email: 'hello@genieapps.co',
  social: {
    instagram: 'https://instagram.com/',
    x: 'https://x.com/',
    linkedin: 'https://linkedin.com/',
  },
};

export const faqs = [
  {
    q: 'What is genie?',
    a: 'A mobile app for gifting. Celebrants create an event, add products and services from genie merchants to a wishlist, and share it with friends. Friends buy the gifts — openly or anonymously.',
  },
  {
    q: 'How do anonymous gifts work?',
    a: "A friend can add a secret gift to your wishlist. You won't see who it's from until the gift physically reaches you, then it's revealed in the app.",
  },
  {
    q: 'How do payments work?',
    a: 'Gifts are paid for by bank transfer or from your genie wallet, in Naira. Merchants are settled automatically after delivery, minus genie fees.',
  },
  {
    q: 'Can I sell on genie?',
    a: 'Yes. Merchants list products and services, manage inventory and orders, and receive payouts to their bank account. Join the waitlist and pick "I want to sell".',
  },
  {
    q: 'When is it launching?',
    a: 'We are in active development. Join the waitlist and we will email you the moment the app is on the App Store and Play Store.',
  },
];
