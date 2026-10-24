'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { hashPassword, isValidEmail, normalizeEmail } from '@genie/core';
import { prisma, type AdminRole } from '@genie/db';
import { audit } from '@/admin/lib/audit';
import { ADMIN_ROLES, guardWrite, type AdminRoleName } from '@/admin/lib/rbac';

export type CredentialResult =
  | { ok: true; email: string; password: string; note: string }
  | { ok: false; error: string }
  | null;

/** Only super admins manage admins & super admins; admins manage the operational roles. */
function canManage(actor: string, target: string): boolean {
  if (actor === 'SUPER_ADMIN') return true;
  return actor === 'ADMIN' && ['SUPPORT', 'FINANCE', 'CONCIERGE'].includes(target);
}

const tempPassword = () => `${randomBytes(12).toString('base64url')}!9a`;

export async function createAdmin(_prev: CredentialResult, formData: FormData): Promise<CredentialResult> {
  const session = await guardWrite('team');
  if (!session) return { ok: false, error: 'You don’t have permission to do that.' };

  const name = String(formData.get('name') ?? '').trim().slice(0, 80);
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const role = String(formData.get('role') ?? '') as AdminRoleName;

  if (!name) return { ok: false, error: 'Enter their name.' };
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (!ADMIN_ROLES.includes(role)) return { ok: false, error: 'Pick a role.' };
  if (!canManage(session.role, role)) return { ok: false, error: `Only a super admin can create a ${role.toLowerCase().replace('_', ' ')}.` };
  if (await prisma.adminUser.findUnique({ where: { email } })) return { ok: false, error: 'An admin with that email already exists.' };

  const password = tempPassword();
  const created = await prisma.adminUser.create({
    data: { name, email, role: role as AdminRole, passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await audit(session, 'admin.create', 'AdminUser', created.id, { after: { email, role } });
  revalidatePath('/admin/team');
  return { ok: true, email, password, note: 'Share this once, privately. They’ll be asked to set their own password.' };
}

export async function resetAdminPassword(_prev: CredentialResult, formData: FormData): Promise<CredentialResult> {
  const session = await guardWrite('team');
  if (!session) return { ok: false, error: 'You don’t have permission to do that.' };
  const target = await prisma.adminUser.findUnique({ where: { id: String(formData.get('id') ?? '') } });
  if (!target) return { ok: false, error: 'Admin not found.' };
  if (target.id !== session.sub && !canManage(session.role, target.role)) return { ok: false, error: 'You can’t manage that account.' };

  const password = tempPassword();
  await prisma.adminUser.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await audit(session, 'admin.password_reset', 'AdminUser', target.id, { after: { email: target.email } });
  revalidatePath('/admin/team');
  return { ok: true, email: target.email, password, note: 'Temporary password — share it once, privately.' };
}

/** Never leave the portal without an active super admin. */
async function lastActiveSuperAdmin(id: string): Promise<boolean> {
  const others = await prisma.adminUser.count({ where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } } });
  return others === 0;
}

export async function setAdminActive(id: string, active: boolean) {
  const session = await guardWrite('team');
  if (!session || id === session.sub) return;
  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target || target.isActive === active || !canManage(session.role, target.role)) return;
  if (!active && target.role === 'SUPER_ADMIN' && (await lastActiveSuperAdmin(id))) return;

  await prisma.adminUser.update({ where: { id }, data: { isActive: active } });
  await audit(session, active ? 'admin.reactivate' : 'admin.deactivate', 'AdminUser', id, { after: { email: target.email } });
  revalidatePath('/admin/team');
}

export async function setAdminRole(id: string, formData: FormData) {
  const session = await guardWrite('team');
  if (!session || id === session.sub) return;
  const role = String(formData.get('role') ?? '') as AdminRoleName;
  if (!ADMIN_ROLES.includes(role)) return;
  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target || target.role === role) return;
  if (!canManage(session.role, target.role) || !canManage(session.role, role)) return;
  if (target.role === 'SUPER_ADMIN' && (await lastActiveSuperAdmin(id))) return;

  await prisma.adminUser.update({ where: { id }, data: { role: role as AdminRole } });
  await audit(session, 'admin.role_change', 'AdminUser', id, { before: { role: target.role }, after: { role } });
  revalidatePath('/admin/team');
}
