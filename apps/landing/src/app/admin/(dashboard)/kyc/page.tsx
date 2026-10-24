import { revalidatePath } from 'next/cache';
import { prisma } from '@genie/db';
import { audit } from '@/admin/lib/audit';
import { canWrite, guard, guardWrite } from '@/admin/lib/rbac';
import { fmtDateTime, fullName } from '@/admin/lib/format';
import { A, Empty, Forbidden, PageHeader, SectionTitle, StatusPill, dangerBtn } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

async function decide(id: string, formData: FormData) {
  'use server';
  const session = await guardWrite('kyc');
  if (!session) return;
  const approve = formData.get('decision') === 'approve';
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300);
  if (!approve && !reason) throw new Error('Give a reason — it is shown to the user so they know what to fix.');

  const kyc = await prisma.kycVerification.findUnique({ where: { id } });
  if (!kyc || kyc.status !== 'PENDING') return;

  await prisma.$transaction([
    prisma.kycVerification.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        rejectionReason: approve ? null : reason,
        reviewedByAdminId: session.sub,
        reviewedAt: new Date(),
      },
    }),
    prisma.notification.create({
      data: {
        userId: kyc.userId,
        channel: 'IN_APP',
        category: 'SYSTEM',
        type: approve ? 'kyc.approved' : 'kyc.rejected',
        title: approve ? 'You’re verified ✅' : 'We couldn’t verify your identity',
        body: approve ? 'Your identity check is complete.' : reason,
      },
    }),
  ]);
  await audit(session, approve ? 'kyc.approve' : 'kyc.reject', 'KycVerification', id, {
    before: { status: kyc.status },
    after: { status: approve ? 'APPROVED' : 'REJECTED', reason: approve ? undefined : reason },
  });
  revalidatePath('/admin/kyc');
}

export default async function KycPage() {
  const session = await guard('kyc');
  if (!session) return <Forbidden />;
  const writer = canWrite(session.role, 'kyc');

  const [pending, history] = await Promise.all([
    prisma.kycVerification.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
      take: 100,
    }),
    prisma.kycVerification.findMany({
      where: { status: { not: 'PENDING' } },
      orderBy: { reviewedAt: 'desc' },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      take: 20,
    }),
  ]);

  return (
    <div>
      <PageHeader title="KYC reviews" subtitle="Identity checks waiting for a decision. Oldest first." />

      {pending.length === 0 ? (
        <Empty>Nothing to review — you&apos;re all caught up.</Empty>
      ) : (
        <div className="space-y-3">
          {pending.map((k) => (
            <div key={k.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <A href={`/users/${k.user.id}`}>{fullName(k.user)}</A>
                  <div className="text-xs text-ink-muted">
                    {k.user.email}
                    {k.user.phone ? ` · ${k.user.phone}` : ''} · submitted {fmtDateTime(k.createdAt)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span><span className="text-ink-muted">BVN: </span>{k.bvnLast4 ? `••••••${k.bvnLast4}` : '—'}{k.bvnStatus ? ` (${k.bvnStatus})` : ''}</span>
                    <span><span className="text-ink-muted">ID: </span>{k.idDocType ?? '—'}</span>
                    {k.selfieBlobUrl && <a href={k.selfieBlobUrl} target="_blank" rel="noreferrer" className="font-medium text-[var(--genie-primary-solid)] hover:underline">View selfie ↗</a>}
                    {k.idDocBlobUrl && <a href={k.idDocBlobUrl} target="_blank" rel="noreferrer" className="font-medium text-[var(--genie-primary-solid)] hover:underline">View ID document ↗</a>}
                  </div>
                </div>
                {writer && (
                  <form action={decide.bind(null, k.id)} className="flex min-w-[260px] flex-1 flex-col gap-2 sm:max-w-sm">
                    <input name="reason" placeholder="Reason (required to reject)" className="input" maxLength={300} />
                    <div className="flex gap-2">
                      <button name="decision" value="approve" className="btn flex-1">Approve</button>
                      <button name="decision" value="reject" className={`${dangerBtn} flex-1 py-2 text-sm`}>Reject</button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Recently decided</SectionTitle>
      {history.length === 0 ? (
        <Empty>No decisions yet.</Empty>
      ) : (
        <div className="card divide-y divide-[var(--genie-border)] p-0">
          {history.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <div>
                <A href={`/users/${k.user.id}`}>{fullName(k.user)}</A>
                {k.rejectionReason && <span className="ml-2 text-xs text-ink-muted">— {k.rejectionReason}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-ink-muted">{fmtDateTime(k.reviewedAt)}</span>
                <StatusPill status={k.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
