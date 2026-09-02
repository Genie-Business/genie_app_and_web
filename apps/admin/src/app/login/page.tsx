import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { verifyPassword } from '@genie/core';
import { prisma } from '@genie/db';
import { createSession, getSession } from '@/lib/session';
import { isRateLimited } from '@/lib/rate-limit';

async function login(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').toLowerCase().trim().slice(0, 160);
  const password = String(formData.get('password') ?? '').slice(0, 200);

  const h = await headers();
  const ip = h.get('x-vercel-forwarded-for') ?? h.get('x-real-ip') ?? 'unknown';
  if (
    (await isRateLimited(`admin-login:${ip}`, 10, 15 * 60_000)) ||
    (await isRateLimited(`admin-login:${email}`, 6, 15 * 60_000))
  ) {
    redirect('/login?error=throttled');
  }

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  const hash = admin?.passwordHash ?? '$scrypt$0$0$0$AA==$AA==';
  const ok = await verifyPassword(password, hash);
  if (!admin || !admin.isActive || !ok) {
    redirect('/login?error=1');
  }
  await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await createSession({ sub: admin.id, email: admin.email, role: admin.role });
  redirect('/');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect('/');
  const { error } = await searchParams;
  const message =
    error === 'throttled'
      ? 'Too many attempts. Wait a few minutes and try again.'
      : 'Incorrect email or password.';

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm">
        <h1 className="font-display text-xl font-bold">genie Admin</h1>
        <p className="mt-1 text-sm text-ink-muted">Sign in to the control panel.</p>
        {error && (
          <p className="mt-4 rounded-lg bg-error-bg px-3 py-2 text-sm text-error-fg">{message}</p>
        )}
        <form action={login} className="mt-5 space-y-3">
          <input name="email" type="email" required placeholder="you@genieapps.co" className="input" />
          <input name="password" type="password" required placeholder="Password" className="input" />
          <button type="submit" className="btn w-full">Sign in</button>
        </form>
      </div>
    </main>
  );
}
