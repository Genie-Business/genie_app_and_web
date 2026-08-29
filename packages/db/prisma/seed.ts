/* eslint-disable no-console */
import { hashPassword, randomCode } from '@genie/core';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? `genie-${randomCode(10)}`;
  const passwordHash = await hashPassword(adminPassword);
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'genie Admin',
      passwordHash,
      role: 'SUPER_ADMIN',
      mustChangePassword: true,
    },
  });
  console.log(`  admin: ${adminEmail}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`  admin password (save this — shown once): ${adminPassword}`);
  }

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

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
