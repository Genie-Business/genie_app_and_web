import { notFound, redirect } from 'next/navigation';
import { prisma, type DeliveryOption } from '@genie/db';
import { audit } from '@/lib/audit';
import { guard, guardWrite } from '@/lib/rbac';
import { Forbidden } from '@/components/ui';

export const dynamic = 'force-dynamic';

const DELIVERY_OPTIONS: DeliveryOption[] = ['BOTH', 'DELIVERY', 'PICKUP'];

function koboFromNaira(v: FormDataEntryValue | null): bigint {
  const n = Math.round(Number(String(v ?? '0').replace(/,/g, '')) * 100);
  return BigInt(Number.isFinite(n) && n > 0 ? n : 0);
}

function parseDeliveryOption(v: FormDataEntryValue | null): DeliveryOption {
  const s = String(v ?? '');
  return (DELIVERY_OPTIONS as string[]).includes(s) ? (s as DeliveryOption) : 'BOTH';
}

async function markInReview(id: string) {
  'use server';
  const session = await guardWrite('concierge');
  if (!session) return;
  const { count } = await prisma.conciergeRequest.updateMany({
    where: { id, status: 'NEW' },
    data: { status: 'IN_REVIEW', claimedByAdminId: session.sub },
  });
  if (count) await audit(session, 'concierge.claim', 'ConciergeRequest', id);
  redirect(`/concierge/${id}`);
}

async function activate(id: string, formData: FormData) {
  'use server';
  const session = await guardWrite('concierge');
  if (!session) return;

  const request = await prisma.conciergeRequest.findUniqueOrThrow({ where: { id } });
  if (request.status !== 'NEW' && request.status !== 'IN_REVIEW') return;
  const item = await prisma.wishlistItem.findUnique({ where: { id: request.wishlistItemId } });
  if (!item) {
    // The celebrant removed it from their wishlist before review — nothing to activate.
    await prisma.conciergeRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: 'The wishlist item was removed before review.' },
    });
    redirect('/concierge');
  }

  const priceKobo = koboFromNaira(formData.get('priceNaira'));
  const stock = Math.max(0, Math.trunc(Number(formData.get('stock') ?? 0)));
  const categoryId = String(formData.get('categoryId') ?? '');
  const deliveryOption = parseDeliveryOption(formData.get('deliveryOption'));
  const imageUrls = String(formData.get('imageUrls') ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (priceKobo <= 0n || !categoryId || stock < 1) {
    throw new Error('Set a price, category, and at least 1 unit of stock to activate.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImage.deleteMany({ where: { productId: request.productId } });
    await tx.product.update({
      where: { id: request.productId },
      data: {
        priceKobo,
        categoryId,
        deliveryOption,
        status: 'ACTIVE',
        images: { create: imageUrls.map((url, position) => ({ blobUrl: url, position })) },
      },
    });
    await tx.inventory.upsert({
      where: { productId: request.productId },
      create: { productId: request.productId, availableStock: stock },
      update: { availableStock: stock },
    });
    await tx.conciergeRequest.update({
      where: { id },
      data: { status: 'ACTIVE', claimedByAdminId: session.sub },
    });
    // In-app only — the API's notify() also fans out to push/email per the
    // user's preferences; this direct write (admin has no API surface for
    // this) skips that side channel, matching this feature's known scope cuts.
    await tx.notification.create({
      data: {
        userId: request.requestedByUserId,
        channel: 'IN_APP',
        category: 'EVENT',
        type: 'concierge.activated',
        title: 'Your imported gift is ready 🎁',
        body: `"${request.name}" is now on your wishlist and ready to be gifted.`,
        payload: { conciergeRequestId: id, productId: request.productId },
      },
    });
  });
  await audit(session, 'concierge.activate', 'ConciergeRequest', id, {
    after: { priceKobo, stock, categoryId, productId: request.productId },
  });

  redirect('/concierge');
}

async function reject(id: string, formData: FormData) {
  'use server';
  const session = await guardWrite('concierge');
  if (!session) return;
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason) throw new Error('Give a reason so the celebrant knows why.');

  const request = await prisma.conciergeRequest.findUniqueOrThrow({ where: { id } });
  if (request.status !== 'NEW' && request.status !== 'IN_REVIEW') return;

  await prisma.$transaction(async (tx) => {
    await tx.wishlistItem.deleteMany({ where: { id: request.wishlistItemId } });
    await tx.product.update({ where: { id: request.productId }, data: { status: 'DELETED' } });
    await tx.conciergeRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, claimedByAdminId: session.sub },
    });
    await tx.notification.create({
      data: {
        userId: request.requestedByUserId,
        channel: 'IN_APP',
        category: 'EVENT',
        type: 'concierge.rejected',
        title: "We couldn't source that gift",
        body: `"${request.name}" — ${reason}`,
        payload: { conciergeRequestId: id },
      },
    });
  });
  await audit(session, 'concierge.reject', 'ConciergeRequest', id, { after: { reason } });

  redirect('/concierge');
}

export default async function ConciergeReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await guard('concierge');
  if (!session) return <Forbidden />;
  const { id } = await params;

  const request = await prisma.conciergeRequest.findUnique({
    where: { id },
    include: { requestedBy: { select: { firstName: true, lastName: true, email: true, phone: true } } },
  });
  if (!request) notFound();

  const [item, categories] = await Promise.all([
    prisma.wishlistItem.findUnique({
      where: { id: request.wishlistItemId },
      include: { wishlist: { include: { event: { select: { name: true } } } } },
    }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  const decided = request.status === 'ACTIVE' || request.status === 'REJECTED' || request.status === 'CANCELLED';
  const estimateNaira = request.estimatedPriceKobo ? Number(request.estimatedPriceKobo) / 100 : '';

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold">{request.name}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Requested by {request.requestedBy.firstName} {request.requestedBy.lastName} ({request.requestedBy.email})
        {item ? <> for &ldquo;{item.wishlist.event.name} — {item.wishlist.name}&rdquo;</> : ' — wishlist item removed'}
      </p>

      <div className="card mt-5 space-y-2 text-sm">
        <div>
          <span className="text-ink-muted">Link: </span>
          <a href={request.sourceUrl} target="_blank" rel="noreferrer" className="text-[var(--genie-primary-solid)] hover:underline">
            {request.sourceUrl}
          </a>
        </div>
        {request.note && <div><span className="text-ink-muted">Note: </span>{request.note}</div>}
        {estimateNaira !== '' && <div><span className="text-ink-muted">Their estimate: </span>₦{Number(estimateNaira).toLocaleString('en-NG')}</div>}
        <div><span className="text-ink-muted">Status: </span>{request.status.replace('_', ' ')}</div>
        {request.status === 'REJECTED' && request.rejectionReason && (
          <div className="text-error-fg"><span className="text-ink-muted">Rejected: </span>{request.rejectionReason}</div>
        )}
      </div>

      {!decided && item && (
        <>
          {request.status === 'NEW' && (
            <form action={markInReview.bind(null, id)} className="mt-4">
              <button className="text-sm font-medium text-[var(--genie-primary-solid)] hover:underline">
                Mark as being reviewed
              </button>
            </form>
          )}

          <form action={activate.bind(null, id)} className="card mt-5 space-y-4">
            <h2 className="font-display text-lg font-bold">Price &amp; activate</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-ink-secondary">Price (₦)</span>
                <input name="priceNaira" type="number" min="1" step="0.01" defaultValue={estimateNaira || ''} required className="input mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-secondary">Stock</span>
                <input name="stock" type="number" min="1" defaultValue={1} required className="input mt-1" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-ink-secondary">Category</span>
              <select name="categoryId" required className="input mt-1">
                <option value="">Choose…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-secondary">Fulfilment</span>
              <select name="deliveryOption" defaultValue="BOTH" className="input mt-1">
                <option value="BOTH">Pickup or delivery</option>
                <option value="DELIVERY">Delivery only</option>
                <option value="PICKUP">Pickup only</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-secondary">Photo URL(s) — one per line, optional</span>
              <textarea name="imageUrls" rows={2} className="input mt-1" placeholder="https://…" />
            </label>
            <button type="submit" className="btn">Activate — make it giftable</button>
          </form>

          <form action={reject.bind(null, id)} className="card mt-4 space-y-3">
            <h2 className="font-display text-lg font-bold text-error-fg">Reject</h2>
            <textarea
              name="reason"
              rows={2}
              required
              placeholder="Why can't this be sourced? (shown to the celebrant)"
              className="input"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-error-fg transition-colors hover:bg-red-50"
            >
              Reject request
            </button>
          </form>
        </>
      )}
      {!decided && !item && (
        <div className="card mt-5 text-sm text-error-fg">
          The celebrant removed this item from their wishlist — there&apos;s nothing to activate. Reject it to close it out.
          <form action={reject.bind(null, id)} className="mt-3 space-y-3">
            <input type="hidden" name="reason" value="The wishlist item was removed before review." />
            <button type="submit" className="btn">Close request</button>
          </form>
        </div>
      )}
    </div>
  );
}
