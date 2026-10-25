export const site = {
  name: 'genie',
  tagline: 'Gifts they actually want.',
  description:
    'genie is the Nigerian gifting app. Build a wishlist of real products for your birthday, wedding or baby shower, share one link, and let friends send exactly what you want, openly or as an anonymous surprise revealed only when it arrives.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787',
  email: 'hello@genieapps.co',
  social: {
    instagram: 'https://instagram.com/genieapp',
    x: 'https://x.com/genieapp',
    tiktok: 'https://tiktok.com/@genieapp',
  },
};
