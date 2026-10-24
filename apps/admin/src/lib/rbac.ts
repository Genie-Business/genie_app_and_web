import { redirect } from 'next/navigation';
import { prisma } from '@genie/db';
import { getSession, type AdminSession } from '@/lib/session';

export type AdminRoleName = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'CONCIERGE';

export const ADMIN_ROLES: readonly AdminRoleName[] = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'CONCIERGE'];

export const ROLE_LABEL: Record<AdminRoleName, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  SUPPORT: 'Support',
  FINANCE: 'Finance',
  CONCIERGE: 'Concierge',
};

export type Section =
  | 'overview'
  | 'concierge'
  | 'users'
  | 'merchants'
  | 'events'
  | 'products'
  | 'orders'
  | 'transactions'
  | 'kyc'
  | 'support'
  | 'fees'
  | 'referrals'
  | 'crm'
  | 'team'
  | 'audit'
  | 'settings';

const ALL: readonly AdminRoleName[] = ADMIN_ROLES;
const ADMINS: readonly AdminRoleName[] = ['SUPER_ADMIN', 'ADMIN'];

/** Which admin roles may open which section. Everything not listed here is denied. */
const ACCESS: Record<Section, readonly AdminRoleName[]> = {
  overview: ALL,
  concierge: ['SUPER_ADMIN', 'ADMIN', 'CONCIERGE'],
  users: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  merchants: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  events: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  products: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  orders: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE'],
  transactions: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE'],
  kyc: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  support: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  fees: ['SUPER_ADMIN', 'ADMIN', 'FINANCE'],
  referrals: ['SUPER_ADMIN', 'ADMIN', 'FINANCE'],
  crm: ADMINS,
  team: ADMINS,
  audit: ADMINS,
  settings: ALL,
};

export function can(role: string, section: Section): boolean {
  return (ACCESS[section] as readonly string[]).includes(role);
}

/** Roles that may change things in a section (everyone else gets a read-only view). */
const WRITE: Partial<Record<Section, readonly AdminRoleName[]>> = {
  concierge: ['SUPER_ADMIN', 'ADMIN', 'CONCIERGE'],
  fees: ['SUPER_ADMIN', 'ADMIN', 'FINANCE'],
  kyc: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  support: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
};

export function canWrite(role: string, section: Section): boolean {
  return ((WRITE[section] ?? ADMINS) as readonly string[]).includes(role) && can(role, section);
}

type NavItem = { label: string; href: string; section: Section };
export const NAV_GROUPS: ReadonlyArray<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/', section: 'overview' }],
  },
  {
    label: 'Concierge',
    items: [
      { label: 'Requests', href: '/concierge', section: 'concierge' },
      { label: 'Orders to fulfil', href: '/concierge/orders', section: 'concierge' },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Users', href: '/users', section: 'users' },
      { label: 'Merchants', href: '/merchants', section: 'merchants' },
      { label: 'KYC', href: '/kyc', section: 'kyc' },
      { label: 'Support inbox', href: '/support', section: 'support' },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { label: 'Events & wishlists', href: '/events', section: 'events' },
      { label: 'Products', href: '/products', section: 'products' },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Orders', href: '/orders', section: 'orders' },
      { label: 'Transactions', href: '/transactions', section: 'transactions' },
      { label: 'Fees', href: '/fees', section: 'fees' },
      { label: 'Referrals', href: '/referrals', section: 'referrals' },
    ],
  },
  {
    label: 'Growth',
    items: [{ label: 'Waitlist (CRM)', href: '/crm', section: 'crm' }],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Team', href: '/team', section: 'team' },
      { label: 'Audit log', href: '/audit', section: 'audit' },
      { label: 'Settings', href: '/settings', section: 'settings' },
    ],
  },
];

/**
 * The signed-in admin with their *current* role. The JWT lives 12h, so a
 * deactivation or role change must be picked up from the database, not the cookie.
 */
async function currentSession(): Promise<AdminSession | null> {
  const session = await getSession();
  if (!session) return null;
  const admin = await prisma.adminUser.findUnique({
    where: { id: session.sub },
    select: { isActive: true, role: true, email: true },
  });
  if (!admin || !admin.isActive) return null;
  return { sub: session.sub, email: admin.email, role: admin.role };
}

/**
 * Page guard. Redirects to /login when signed out; returns null when the role
 * can't open the section (render <Forbidden />).
 */
export async function guard(section: Section): Promise<AdminSession | null> {
  const session = await currentSession();
  if (!session) redirect('/login');
  return can(session.role, section) ? session : null;
}

/** Server-action guard: null means "do nothing" (never trust the page that rendered the form). */
export async function guardWrite(section: Section): Promise<AdminSession | null> {
  const session = await currentSession();
  if (!session) return null;
  return can(session.role, section) && canWrite(session.role, section) ? session : null;
}
