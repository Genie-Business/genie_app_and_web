import { revalidatePath } from 'next/cache';
import { prisma, type KybStatus, type Prisma } from '@genie/db';
import { audit } from '@/admin/lib/audit';
import { canWrite, guard, guardWrite } from '@/admin/lib/rbac';
import { CONCIERGE_EMAIL } from '@/admin/lib/constants';
import { PAGE_SIZE, fmtDate, one, pageArgs } from '@/admin/lib/format';
import {
  A, Empty, FilterBar, Forbidden, PageHeader, Pager, Person, Pill, StatusPill, Table, Td, Th, Thead, Tr, ghostBtn,
} from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;

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
        title: status === 'VERIFIED' ? 'Your business is verified' : 'Business verification update',
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
  revalidatePath('/admin/merchants');
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

  const [total, merchants] = await Promise.all([
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
  ]);

  return (
    <div>
      <PageHeader
        title="Merchants"
        subtitle="Sellers on genie. They confirm their email in the app, then wait here for you to approve their business. Approval is what lets them list products and receive payouts."
      />

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
