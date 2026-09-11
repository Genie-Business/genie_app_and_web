/**
 * Create (or update the role of) an admin-portal account. There's no
 * admin-user-management UI yet, so this is the only way to provision one —
 * in particular the first CONCIERGE account for the import-a-gift service.
 *
 * Usage (from packages/db, or anywhere with DATABASE_URL/DIRECT_URL set):
 *   node --env-file=../../.env scripts/create-admin.mjs --email you@genieapps.co --name "Your Name" --role CONCIERGE
 *   node --env-file=../../.env scripts/create-admin.mjs --email you@genieapps.co --name "Your Name" --role CONCIERGE --password "a real password"
 *
 * Omit --password to get a random one printed once (share it out of band and
 * have them change it — new admins are created with mustChangePassword: true).
 * Re-running with an existing --email updates name/role in place and leaves
 * the password untouched unless --password is given.
 */
import { randomBytes, scrypt as _scrypt } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'CONCIERGE'];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** scrypt hash in @genie/core's format — inlined so this runs under plain node. */
function hashPassword(password) {
  const [N, r, p, maxmem] = [2 ** 15, 8, 1, 64 * 1024 * 1024];
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    _scrypt(password.normalize('NFKC'), salt, 64, { N, r, p, maxmem }, (err, dk) => {
      if (err) reject(err);
      else resolve(['scrypt', N, r, p, salt.toString('base64'), dk.toString('base64')].join('$'));
    });
  });
}

function randomPassword() {
  return randomBytes(18).toString('base64url');
}

const email = arg('email')?.toLowerCase().trim();
const name = arg('name')?.trim();
const role = arg('role')?.toUpperCase().trim();
const explicitPassword = arg('password');

if (!email || !name || !role) {
  console.error('Usage: create-admin.mjs --email <email> --name "<name>" --role <role> [--password <password>]');
  console.error(`Roles: ${ROLES.join(', ')}`);
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`Unknown role "${role}". Must be one of: ${ROLES.join(', ')}`);
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

const existing = await prisma.adminUser.findUnique({ where: { email } });
const password = explicitPassword ?? (existing ? undefined : randomPassword());

const admin = await prisma.adminUser.upsert({
  where: { email },
  update: {
    name,
    role,
    isActive: true,
    ...(password ? { passwordHash: await hashPassword(password), mustChangePassword: true } : {}),
  },
  create: {
    email,
    name,
    role,
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
  },
});

console.log(`${existing ? 'Updated' : 'Created'} admin: ${admin.email} (${admin.role})`);
if (password) {
  console.log(`Password (save this — shown once): ${password}`);
} else {
  console.log('Password unchanged.');
}
await prisma.$disconnect();
