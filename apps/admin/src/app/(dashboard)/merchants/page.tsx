import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma, type KybStatus, type Prisma } from '@genie/db';
import { audit } from '@/lib/audit';
import { canWrite, guard, guardWrite } from '@/lib/rbac';
import { CONCIERGE_EMAIL } from '@/lib/constants';
import { PAGE_SIZE, fmtDate, one, pageArgs } from '@/lib/format';
import {
  A, Empty, FilterBar, Forbidden, PageHeader, Pager, Person, Pill, SectionTitle, StatusPill, Table, Td, Th, Thead, Tr, Field, ghostBtn, dangerBtn,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;

// No 0/O/1/I/L — these get read out over the phone. Same GENIE-XXXXXX shape as the seeded codes.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode(): string {
  const bytes = randomBytes(6);
  return `GENIE-${Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`;
}

async function setKyb(userId: string, status: KybStatus) {
  'use server';
  const session = await guardWrite('merchants');
  if (!session) return;
  const profile = await prisma.merchantProfile.findUnique({ where: { userId }, include: { user: { select: { email: true } } } });
  if (!profile || profile.kybStatus === status || profile.user.email === CONCIERGE_EMAIL) return;

  await prisma.$transaction([
    prisma.merchantProfile.update({ where: { userId }, data: { kybStatus: status } }),
    prisma.notification.create({
      data: {
        userId,
        channel: 'IN_APP',
        category: 'SYSTEM',
        type: 'merchant.kyb',
        title: status === 'VERIFIED' ? 'Your business is verified ✅' : 'Business verification update',
        body:
          status === 'VERIFIED'
            ? 'You can now list products and receive payouts.'
            : 'We couldn’t verify your business details. Please contact support.',
      },
    }),
  ]);
  await audit(session, `merchant.kyb.${status.toLowerCase()}`, 'MerchantProfile', profile.id, {
    before: { kybStatus: profile.kybStatus },
    after: { kybStatus: status },
  });
  revalidatePath('/merchants');
}

async function createInvite(formData: FormData) {
  'use server';
  const session = await guardWrite('merchants');
  if (!session) return;
  const days = Math.trunc(Number(formData.get('days') ?? 0));
  const count = Math.min(20, Math.max(1, Math.trunc(Number(formData.get('count') ?? 1)) || 1));
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;

  for (let i = 0; i < count; i++) {
    const code = newCode();
    const row = await prisma.merchantInviteCode.create({
      data: { code, singleUse: true, expiresAt, createdByAdminId: session.sub },
    });
    await audit(session, 'merchant.invite.create', 'MerchantInviteCode', row.id, { after: { expiresAt } });
  }
  revalidatePath('/merchants');
}

async function revokeInvite(id: string) {
  'use server';
  const session = await guardWrite('merchants');
  if (!session) return;
  const code = await prisma.merchantInviteCode.findUnique({ where: { id } });
  if (!code || code.usedByUserId) return;
  await prisma.merchantInviteCode.delete({ where: { id } });
  await audit(session, 'merchant.invite.revoke', 'MerchantInviteCode', id, { before: { code: code.code } });
  revalidatePath('/merchants');
}

export default async function MerchantsPage({ searchParams }: { searchParams: SP }) {
  const session = await guard('merchants');
  if (!session) return <Forbidden />;
  const writer = canWrite(session.role, 'merchants');

  const sp = await searchParams;
  const q = one(sp.q);
  const kyb = one(sp.kyb);
  const { page, skip, take } = pageArgs(one(sp.page));

  const where: Prisma.MerchantProfileWhereInput = {
    ...(kyb === 'PENDING' || kyb === 'VERIFIED' || kyb === 'REJECTED' ? { kybStatus: kyb } : {}),
    ...(q
      ? {
          OR: [
            { businessName: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { businessPhone: { contains: q } },
          ],
        }
      : {}),
  };

  const [total, merchants, codes] = await Promise.all([
    prisma.merchantProfile.count({ where }),
    prisma.merchantProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        user: { select: { id: true, email: true, status: true, _count: { select: { productsAsMerchant: true, ordersAsMerchant: true } } } },
      },
    }),
    prisma.merchantInviteCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: { merchantProfile: { select: { businessName: true } } },
    }),
  ]);

  const now = Date.now();

  return (
    <div>
      <PageHeader
        title="Merchants"
        subtitle="Sellers on genie. Merchants join with a one-time invite code from you, then you approve their business."
      />

      <div className="card">
        <h2 className="font-display text-base font-bold">Invite codes</h2>
        <p className="mt-1 text-sm text-ink-muted">Give a code to a merchant — they enter it as the confirmation code when signing up. Each works once.</p>
        {writer && (
          <form action={createInvite} className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="How many">
              <input name="count" type="number" min={1} max={20} defaultValue={1} className="input w-24" />
            </Field>
            <Field label="Expires in (days)" hint="Blank = never">
              <input name="days" type="number" min={1} max={365} placeholder="—" className="input w-32" />
            </Field>
            <button className="btn">Generate</button>
          </form>
        )}
        {codes.length > 0 && (
          <div className="mt-4">
            <Table min={560}>
              <Thead>
                <Th>Code</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Expires</Th>
                <Th right />
              </Thead>
              <tbody>
                {codes.map((c) => {
                  const expired = !c.usedByUserId && c.expiresAt && c.expiresAt.getTime() < now;
                  return (
                    <Tr key={c.id}>
                      <Td><span className="font-mono text-sm font-semibold tracking-wider">{c.code}</span></Td>
                      <Td>
                        {c.usedByUserId ? (
                          <Pill tone="neutral">Used by {c.merchantProfile?.businessName ?? 'a merchant'}</Pill>
                        ) : expired ? (
                          <Pill tone="bad">Expired</Pill>
                        ) : (
                          <Pill tone="good">Available</Pill>
                        )}
                      </Td>
                      <Td muted>{fmtDate(c.createdAt)}</Td>
                      <Td muted>{c.expiresAt ? fmtDate(c.expiresAt) : 'Never'}</Td>
                      <Td right>
                        {writer && !c.usedByUserId && (
                          <form action={revokeInvite.bind(null, c.id)}>
                            <button className={dangerBtn}>Revoke</button>
                          </form>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </div>

      <SectionTitle>All merchants</SectionTitle>
      <FilterBar
        q={q}
        placeholder="Search business, email, phone"
        selects={[{ name: 'kyb', value: kyb, label: 'Any KYB status', options: [['PENDING', 'Pending'], ['VERIFIED', 'Verified'], ['REJECTED', 'Rejected']] }]}
      />
      {merchants.length === 0 ? (
        <Empty>No merchants match.</Empty>
      ) : (
        <Table min={900}>
          <Thead>
            <Th>Business</Th>
            <Th>State</Th>
            <Th>Bank</Th>
            <Th>Products</Th>
            <Th>Orders</Th>
            <Th>Joined</Th>
            <Th>KYB</Th>
            <Th right />
          </Thead>
          <tbody>
            {merchants.map((m) => (
              <Tr key={m.id}>
                <Td>
                  <A href={`/users/${m.user.id}`}>
                    <Person name={m.businessName} sub={m.user.email} />
                  </A>
                </Td>
                <Td muted>{m.businessState ?? '—'}</Td>
                <Td muted>{m.bankName ? `${m.bankName} · ${m.bankAccountNumber ?? ''}` : '—'}</Td>
                <Td>{m.user._count.productsAsMerchant}</Td>
                <Td>{m.user._count.ordersAsMerchant}</Td>
                <Td muted>{fmtDate(m.createdAt)}</Td>
                <Td>
                  <StatusPill status={m.kybStatus} />
                </Td>
                <Td right>
                  {m.user.email === CONCIERGE_EMAIL ? (
                    <Pill tone="info">System account</Pill>
                  ) : (
                    writer && (
                    <div className="flex justify-end gap-2">
                      {m.kybStatus !== 'VERIFIED' && (
                        <form action={setKyb.bind(null, m.user.id, 'VERIFIED')}>
                          <button className="btn px-3 py-1.5 text-xs">Approve</button>
                        </form>
                      )}
                      {m.kybStatus !== 'REJECTED' && (
                        <form action={setKyb.bind(null, m.user.id, 'REJECTED')}>
                          <button className={ghostBtn}>Reject</button>
                        </form>
                      )}
                    </div>
                    )
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager base="/merchants" params={{ q, kyb }} page={page} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
