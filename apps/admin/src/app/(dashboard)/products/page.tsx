import { revalidatePath } from 'next/cache';
import { prisma, type Prisma, type ProductStatus } from '@genie/db';
import { audit } from '@/lib/audit';
import { canWrite, guard, guardWrite } from '@/lib/rbac';
import { PAGE_SIZE, fmtDate, formatKobo, one, pageArgs, titleCase } from '@/lib/format';
import { Empty, FilterBar, Forbidden, PageHeader, Pager, Person, Pill, StatusPill, Table, Td, Th, Thead, Tr, dangerBtn, ghostBtn } from '@/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;
const STATUSES: ProductStatus[] = ['ACTIVE', 'DRAFT', 'DELETED'];

async function setStatus(id: string, status: ProductStatus) {
  'use server';
  const session = await guardWrite('products');
  if (!session) return;
  const product = await prisma.product.findUnique({ where: { id }, include: { conciergeRequest: { select: { status: true } } } });
  if (!product || product.status === status) return;
  // A concierge placeholder only goes live through the concierge review (it needs a price + stock).
  if (status === 'ACTIVE' && product.conciergeRequest && product.conciergeRequest.status !== 'ACTIVE') return;

  await prisma.product.update({ where: { id }, data: { status } });
  await audit(session, `product.status.${status.toLowerCase()}`, 'Product', id, {
    before: { status: product.status },
    after: { status },
  });
  revalidatePath('/products');
}

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const session = await guard('products');
  if (!session) return <Forbidden />;
  const writer = canWrite(session.role, 'products');

  const sp = await searchParams;
  const q = one(sp.q);
  // Absent = first visit (show live products); present-but-empty = "Any status".
  const status = sp.status === undefined ? 'ACTIVE' : one(sp.status);
  const categoryId = one(sp.category);
  const { page, skip, take } = pageArgs(one(sp.page));

  const where: Prisma.ProductWhereInput = {
    ...((STATUSES as string[]).includes(status) ? { status: status as ProductStatus } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { merchant: { merchantProfile: { businessName: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [total, products, categories] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        category: { select: { name: true } },
        merchant: { select: { firstName: true, merchantProfile: { select: { businessName: true } } } },
        inventory: { select: { availableStock: true } },
        conciergeRequest: { select: { status: true } },
      },
    }),
    prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader title="Products" subtitle="The catalogue merchants (and the concierge) have listed. Deactivated products disappear from search and can’t be gifted." />
      <FilterBar
        q={q}
        placeholder="Search product or merchant"
        selects={[
          { name: 'status', value: status, label: 'Any status', options: STATUSES.map((s) => [s, titleCase(s)] as [string, string]) },
          { name: 'category', value: categoryId, label: 'All categories', options: categories.map((c) => [c.id, c.name] as [string, string]) },
        ]}
      />
      {products.length === 0 ? (
        <Empty>No products match.</Empty>
      ) : (
        <Table min={900}>
          <Thead>
            <Th>Product</Th>
            <Th>Merchant</Th>
            <Th>Category</Th>
            <Th>Price</Th>
            <Th>Stock</Th>
            <Th>Listed</Th>
            <Th>Status</Th>
            <Th right />
          </Thead>
          <tbody>
            {products.map((p) => {
              const pendingConcierge = p.conciergeRequest && p.conciergeRequest.status !== 'ACTIVE';
              return (
                <Tr key={p.id}>
                  <Td>
                    <Person name={p.name} sub={p.conciergeRequest ? 'Concierge import' : undefined} />
                  </Td>
                  <Td muted>{p.merchant.merchantProfile?.businessName ?? p.merchant.firstName}</Td>
                  <Td muted>{p.category.name}</Td>
                  <Td>{p.priceKobo > 0n ? formatKobo(p.priceKobo) : <span className="text-ink-muted">—</span>}</Td>
                  <Td>{p.inventory ? p.inventory.availableStock : '—'}</Td>
                  <Td muted>{fmtDate(p.createdAt)}</Td>
                  <Td>
                    <StatusPill status={p.status} /> {pendingConcierge && <Pill tone="warn">Awaiting concierge</Pill>}
                  </Td>
                  <Td right>
                    {writer && (
                      <div className="flex justify-end gap-2">
                        {p.status === 'ACTIVE' && (
                          <form action={setStatus.bind(null, p.id, 'DRAFT')}>
                            <button className={ghostBtn}>Deactivate</button>
                          </form>
                        )}
                        {p.status !== 'ACTIVE' && !pendingConcierge && p.status !== 'DELETED' && (
                          <form action={setStatus.bind(null, p.id, 'ACTIVE')}>
                            <button className="btn px-3 py-1.5 text-xs">Activate</button>
                          </form>
                        )}
                        {p.status !== 'DELETED' && !p.conciergeRequest && (
                          <form action={setStatus.bind(null, p.id, 'DELETED')}>
                            <button className={dangerBtn}>Remove</button>
                          </form>
                        )}
                      </div>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pager base="/products" params={{ q, status, category: categoryId }} page={page} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
