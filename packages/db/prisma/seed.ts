/* eslint-disable no-console */
import { hashPassword, randomCode } from '@genie/core';
import { PrismaClient } from '@prisma/client';

// Seed over the DIRECT (non-pooled) connection — the pooler is flaky for the
// burst of writes a seed does.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT - Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
];

const CATEGORIES = [
  ['Fashion & Apparel', 'fashion-apparel', 'Clothing, footwear, bags and accessories.'],
  ['Electronics & Gadgets', 'electronics-gadgets', 'Phones, audio, computing and smart devices.'],
  ['Home & Living', 'home-living', 'Furniture, kitchenware, décor and appliances.'],
  ['Beauty & Personal Care', 'beauty-personal-care', 'Skincare, fragrance, grooming and cosmetics.'],
  ['Food & Drinks', 'food-drinks', 'Hampers, cakes, groceries and beverages.'],
  ['Experiences', 'experiences', 'Spa days, dining, travel and event tickets.'],
  ['Gift Cards & Vouchers', 'gift-cards-vouchers', 'Digital and physical gift cards.'],
  ['Baby & Kids', 'baby-kids', 'Toys, clothing and nursery essentials.'],
] as const;

async function main() {
  console.log('Seeding genie reference data…');

  // --- Allowed countries / states -------------------------------------------
  await prisma.allowedCountry.upsert({
    where: { code: 'NG' },
    update: { states: NIGERIA_STATES, isActive: true },
    create: { code: 'NG', name: 'Nigeria', callingCode: '+234', states: NIGERIA_STATES },
  });
  await prisma.allowedCountry.upsert({
    where: { code: 'GB' },
    update: { isActive: true },
    create: { code: 'GB', name: 'United Kingdom', callingCode: '+44', states: [] },
  });

  // --- Fee configuration (editable by admin later) --------------------------
  const fees: Array<[
    'TRANSACTION_FEE' | 'PRODUCT_FEE' | 'LOGISTICS_FEE',
    'PERCENT' | 'FLAT',
    number,
  ]> = [
    ['TRANSACTION_FEE', 'PERCENT', 1.5],
    ['PRODUCT_FEE', 'PERCENT', 5],
    ['LOGISTICS_FEE', 'FLAT', 150000], // ₦1,500 in kobo
  ];
  for (const [key, type, value] of fees) {
    await prisma.feeConfig.upsert({
      where: { key },
      update: { type, value },
      create: { key, type, value },
    });
  }

  // Composite unique has a nullable member, so upsert-by-key isn't reliable here.
  const globalCommission = await prisma.commissionConfig.findFirst({
    where: { scope: 'GLOBAL', categoryId: null },
  });
  if (globalCommission) {
    await prisma.commissionConfig.update({
      where: { id: globalCommission.id },
      data: { type: 'PERCENT', value: 5 },
    });
  } else {
    await prisma.commissionConfig.create({ data: { scope: 'GLOBAL', type: 'PERCENT', value: 5 } });
  }

  // --- Categories ----------------------------------------------------------
  for (const [name, slug, description] of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug },
      update: { name, description },
      create: { name, slug, description },
    });
  }

  // --- Merchant invite codes (dev convenience) ----------------------------
  const unusedCodes = await prisma.merchantInviteCode.count({ where: { usedByUserId: null } });
  for (let i = unusedCodes; i < 5; i += 1) {
    const code = `GENIE-${randomCode(6)}`;
    await prisma.merchantInviteCode.create({ data: { code, singleUse: true } });
    console.log(`  merchant invite code: ${code}`);
  }

  // --- Admin user --------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@genieapps.co';
  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    console.log(`  admin: ${adminEmail} (already exists — password unchanged)`);
  } else {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? `genie-${randomCode(10)}`;
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: 'genie Admin',
        passwordHash: await hashPassword(adminPassword),
        role: 'SUPER_ADMIN',
        mustChangePassword: true,
      },
    });
    console.log(`  admin: ${adminEmail}`);
    console.log(`  admin password (save this — shown once): ${adminPassword}`);
  }

  // --- Demo merchant + catalog (dev/testing) ----------------------------
  await seedDemoCatalog();

  // --- App settings: landing page CRM content -----------------------------
  await prisma.appSetting.upsert({
    where: { key: 'landing.content' },
    update: {},
    create: {
      key: 'landing.content',
      category: 'landing',
      value: {
        hero: {
          headline: 'The wishlist app for people who love giving.',
          sub: 'Create an event, build a wishlist, and let friends gift what you actually want — with a little bit of magic.',
        },
        waitlistCta: 'Join the waitlist',
      },
    },
  });

  // --- App settings: referral reward -------------------------------------
  await prisma.appSetting.upsert({
    where: { key: 'referral.reward' },
    update: {},
    create: {
      key: 'referral.reward',
      category: 'referrals',
      // referrer earns ₦500 when a referee makes their first paid gift.
      value: { enabled: true, referrerKobo: 50000, refereeKobo: 0 },
    },
  });

  console.log('Done.');
}

const DEMO_PRODUCTS: Array<{
  slug: string; // category slug
  name: string;
  description: string;
  priceNaira: number;
  stock: number;
  location: string;
}> = [
  ['fashion-apparel', 'Adire Silk Scarf', 'Hand-dyed silk scarf, 90×90cm.', 18500, 40, 'Lagos'],
  ['electronics-gadgets', 'Wireless Earbuds Pro', 'ANC earbuds with 30h battery case.', 42000, 25, 'Lagos'],
  ['home-living', 'Stoneware Dinner Set (4)', '16-piece hand-glazed stoneware set.', 65000, 12, 'Abuja'],
  ['beauty-personal-care', 'Shea & Cocoa Gift Box', 'Whipped shea butter, black soap, body oil.', 15000, 60, 'Ibadan'],
  ['food-drinks', 'Celebration Cake (8")', '8-inch red velvet, delivered chilled.', 28000, 8, 'Lagos'],
  ['experiences', 'Couples Spa Day', 'Full-day spa package for two.', 90000, 15, 'Lagos'],
  ['gift-cards-vouchers', 'genie Gift Card ₦10,000', 'Spend on anything in the genie catalogue.', 10000, 999, 'Online'],
  ['baby-kids', 'Nursery Starter Bundle', 'Swaddles, muslins, and a plush toy.', 22000, 30, 'Port Harcourt'],
].map(([slug, name, description, priceNaira, stock, location]) => ({
  slug: slug as string,
  name: name as string,
  description: description as string,
  priceNaira: priceNaira as number,
  stock: stock as number,
  location: location as string,
}));

async function seedDemoCatalog() {
  const email = process.env.SEED_MERCHANT_EMAIL ?? 'demo-merchant@genieapps.co';
  const password = process.env.SEED_MERCHANT_PASSWORD ?? 'Demo-merchant-2026!';

  const merchant = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      role: 'MERCHANT',
      firstName: 'genie Demo Store',
      lastName: '(Merchant)',
      email,
      username: 'genie_demo_store',
      referralCode: `GEN${randomCode(6)}`,
      passwordHash: await hashPassword(password),
      stateOfResidence: 'Lagos',
      emailVerifiedAt: new Date(),
      merchantProfile: {
        create: {
          businessName: 'genie Demo Store',
          businessState: 'Lagos',
          bankName: 'Demo Bank',
          bankAccountNumber: '0000000000',
          kybStatus: 'VERIFIED',
        },
      },
    },
  });

  const existing = await prisma.product.count({ where: { merchantId: merchant.id } });
  if (existing > 0) {
    console.log(`  demo merchant already has ${existing} products — skipping catalog seed`);
    return;
  }

  for (const p of DEMO_PRODUCTS) {
    const category = await prisma.category.findUnique({ where: { slug: p.slug } });
    if (!category) continue;
    await prisma.product.create({
      data: {
        merchantId: merchant.id,
        categoryId: category.id,
        name: p.name,
        description: p.description,
        priceKobo: BigInt(p.priceNaira * 100),
        location: p.location,
        deliveryOption: 'BOTH',
        status: 'ACTIVE',
        inventory: { create: { availableStock: p.stock } },
        images: {
          create: {
            blobUrl: `https://picsum.photos/seed/${encodeURIComponent(p.name)}/640/480`,
            position: 0,
          },
        },
      },
    });
  }
  console.log(`  demo merchant: ${email} (${DEMO_PRODUCTS.length} products)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
