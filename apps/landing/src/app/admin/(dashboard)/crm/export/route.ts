import { prisma } from '@genie/db';
import { audit } from '@/admin/lib/audit';
import { guard } from '@/admin/lib/rbac';

export const dynamic = 'force-dynamic';

/** CSV cells starting with = + - @ are executed as formulas by Excel/Sheets — neutralise them. */
function cell(v: string | null | undefined): string {
  let s = v ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const session = await guard('crm');
  if (!session) return new Response('Forbidden', { status: 403 });

  const source = new URL(req.url).searchParams.get('source');
  const rows = await prisma.waitlistSignup.findMany({
    where: source ? { source } : undefined,
    orderBy: { createdAt: 'desc' },
  });

  const csv = [
    'email,source,referrer,signed_up_at',
    ...rows.map((r) => [cell(r.email), cell(r.source), cell(r.referrer), cell(r.createdAt.toISOString())].join(',')),
  ].join('\r\n');

  await audit(session, 'waitlist.export', 'WaitlistSignup', null, { after: { rows: rows.length, source } });

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="genie-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
