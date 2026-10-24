import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma, type SupportStatus } from '@genie/db';
import { audit } from '@/lib/audit';
import { canWrite, guard, guardWrite } from '@/lib/rbac';
import { fmtDateTime, fullName } from '@/lib/format';
import { A, Forbidden, PageHeader, StatusPill, ghostBtn } from '@/components/ui';

export const dynamic = 'force-dynamic';

async function reply(id: string, formData: FormData) {
  'use server';
  const session = await guardWrite('support');
  if (!session) return;
  const body = String(formData.get('body') ?? '').trim().slice(0, 4000);
  if (!body) return;

  const thread = await prisma.supportThread.findUnique({ where: { id } });
  if (!thread || thread.status === 'CLOSED') return;

  await prisma.$transaction([
    prisma.supportMessage.create({ data: { threadId: id, senderType: 'AGENT', senderAdminId: session.sub, body } }),
    // The ball is now in the user's court.
    prisma.supportThread.update({ where: { id }, data: { status: 'PENDING', updatedAt: new Date() } }),
    prisma.notification.create({
      data: {
        userId: thread.userId,
        channel: 'IN_APP',
        category: 'MESSAGE',
        type: 'support.reply',
        title: 'genie support replied',
        body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
        payload: { supportThreadId: id },
      },
    }),
  ]);
  await audit(session, 'support.reply', 'SupportThread', id);
  revalidatePath(`/support/${id}`);
}

async function setStatus(id: string, status: SupportStatus) {
  'use server';
  const session = await guardWrite('support');
  if (!session) return;
  const thread = await prisma.supportThread.findUnique({ where: { id } });
  if (!thread || thread.status === status) return;
  await prisma.supportThread.update({ where: { id }, data: { status } });
  await audit(session, `support.${status.toLowerCase()}`, 'SupportThread', id, { before: { status: thread.status }, after: { status } });
  revalidatePath(`/support/${id}`);
}

export default async function SupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await guard('support');
  if (!session) return <Forbidden />;
  const writer = canWrite(session.role, 'support');
  const { id } = await params;

  const thread = await prisma.supportThread.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!thread) notFound();

  const agentIds = [...new Set(thread.messages.map((m) => m.senderAdminId).filter((x): x is string => !!x))];
  const agents = agentIds.length ? await prisma.adminUser.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }) : [];
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const closed = thread.status === 'CLOSED';

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={thread.subject || 'No subject'}
        subtitle={
          <>
            <A href={`/users/${thread.user.id}`}>{fullName(thread.user)}</A> · {thread.user.email} · <StatusPill status={thread.status} />
          </>
        }
        actions={
          <Link href="/support" className="text-sm font-medium text-[var(--genie-primary-solid)] hover:underline">
            ← Inbox
          </Link>
        }
      />

      <div className="space-y-3">
        {thread.messages.map((m) => {
          const mine = m.senderType === 'AGENT';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : ''}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  mine ? 'bg-[var(--genie-primary-solid)] text-white' : 'border border-[var(--genie-border)] bg-[var(--genie-bg-surface)]'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`mt-1.5 text-xs ${mine ? 'text-white/70' : 'text-ink-muted'}`}>
                  {mine ? (m.senderAdminId ? agentName.get(m.senderAdminId) ?? 'Support' : 'Support') : fullName(thread.user)} · {fmtDateTime(m.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {writer && (
        <div className="mt-6">
          {closed ? (
            <div className="card text-sm text-ink-muted">This conversation is closed — the user would need to start a new one.</div>
          ) : (
            <form action={reply.bind(null, id)} className="card space-y-3">
              <textarea name="body" rows={4} required maxLength={4000} placeholder="Write a reply…" className="input" />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-ink-muted">The user is notified in the app.</span>
                <button className="btn">Send reply</button>
              </div>
            </form>
          )}
          <div className="mt-3 flex gap-2">
            {thread.status !== 'RESOLVED' && !closed && (
              <form action={setStatus.bind(null, id, 'RESOLVED')}>
                <button className={ghostBtn}>Mark resolved</button>
              </form>
            )}
            {!closed && (
              <form action={setStatus.bind(null, id, 'CLOSED')}>
                <button className={ghostBtn}>Close conversation</button>
              </form>
            )}
            {(thread.status === 'RESOLVED' || closed) && (
              <form action={setStatus.bind(null, id, 'OPEN')}>
                <button className={ghostBtn}>Reopen</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
