import { revalidatePath } from 'next/cache';
import { prisma, type FeeKey, type FeeType } from '@genie/db';
import { audit } from '@/admin/lib/audit';
import { canWrite, guard, guardWrite } from '@/admin/lib/rbac';
import { fmtDateTime, formatKobo, koboFromNaira } from '@/admin/lib/format';
import { Field, Forbidden, Notice, PageHeader } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

/** Mirrors apps/api's fee defaults: the API falls back to these when a row doesn't exist. */
const FEES: Array<{ key: FeeKey; title: string; who: string; help: string; fallback: { type: FeeType; value: number } }> = [
  {
    key: 'TRANSACTION_FEE',
    title: 'Transaction fee',
    who: 'Paid by the gifter, on top of the gift',
    help: 'Charged on the item subtotal.',
    fallback: { type: 'PERCENT', value: 1.5 },
  },
  {
    key: 'LOGISTICS_FEE',
    title: 'Delivery (logistics) fee',
    who: 'Paid by the gifter, only for delivered items',
    help: 'A flat amount per delivered gift — pickup items are free.',
    fallback: { type: 'FLAT', value: 150_000 },
  },
  {
    key: 'PRODUCT_FEE',
    title: 'Merchant commission',
    who: 'Deducted from the merchant’s proceeds',
    help: 'Taken from each sale before the merchant is paid.',
    fallback: { type: 'PERCENT', value: 5 },
  },
];
const KEYS = FEES.map((f) => f.key) as string[];

async function saveFee(key: FeeKey, formData: FormData) {
  'use server';
  const session = await guardWrite('fees');
  if (!session || !KEYS.includes(key)) return;

  const type: FeeType = formData.get('type') === 'FLAT' ? 'FLAT' : 'PERCENT';
  const raw = Number(String(formData.get('value') ?? '').replace(/,/g, ''));
  if (!Number.isFinite(raw) || raw < 0) throw new Error('Enter a valid amount.');
  if (type === 'PERCENT' && raw > 50) throw new Error('A percentage above 50% looks like a typo — nothing was saved.');
  // Flat fees are typed in naira but stored in kobo (what the API charges with).
  const value = type === 'FLAT' ? Number(koboFromNaira(formData.get('value'))) : raw;
  const minRaw = String(formData.get('min') ?? '').trim();
  const capRaw = String(formData.get('cap') ?? '').trim();
  const minKobo = type === 'PERCENT' && minRaw ? koboFromNaira(minRaw) : null;
  const capKobo = type === 'PERCENT' && capRaw ? koboFromNaira(capRaw) : null;
  if (minKobo != null && capKobo != null && minKobo > capKobo) throw new Error('The minimum can’t be above the cap.');

  const before = await prisma.feeConfig.findUnique({ where: { key } });
  await prisma.feeConfig.upsert({
    where: { key },
    create: { key, type, value, minKobo, capKobo, updatedByAdminId: session.sub },
    update: { type, value, minKobo, capKobo, updatedByAdminId: session.sub },
  });
  await audit(session, 'fee.update', 'FeeConfig', key, {
    before: before ? { type: before.type, value: before.value.toString(), minKobo: before.minKobo, capKobo: before.capKobo } : null,
    after: { type, value, minKobo, capKobo },
  });
  revalidatePath('/admin/fees');
}

export default async function FeesPage() {
  const session = await guard('fees');
  if (!session) return <Forbidden />;
  const writer = canWrite(session.role, 'fees');

  const rows = await prisma.feeConfig.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return (
    <div className="max-w-3xl">
      <PageHeader title="Fees" subtitle="What genie charges. Changes apply to new payments within about a minute." />
      {!writer && <Notice>You can see the current fees but not change them.</Notice>}

      <div className="space-y-4">
        {FEES.map((f) => {
          const row = byKey.get(f.key);
          const type = row?.type ?? f.fallback.type;
          const raw = row ? Number(row.value) : f.fallback.value;
          const display = type === 'FLAT' ? raw / 100 : raw;
          return (
            <form key={f.key} action={saveFee.bind(null, f.key)} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold">{f.title}</h2>
                  <p className="text-sm text-ink-muted">{f.who}. {f.help}</p>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  {row ? `Updated ${fmtDateTime(row.updatedAt)}` : 'Using the default'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <Field label="Type">
                  <select name="type" defaultValue={type} disabled={!writer} className="input w-40">
                    <option value="PERCENT">Percentage (%)</option>
                    <option value="FLAT">Flat amount (₦)</option>
                  </select>
                </Field>
                <Field label="Value">
                  <input name="value" type="number" step="0.01" min="0" defaultValue={display} disabled={!writer} className="input w-32" required />
                </Field>
                <Field label="Minimum (₦)" hint="Percent fees only">
                  <input name="min" type="number" step="0.01" min="0" defaultValue={row?.minKobo != null ? Number(row.minKobo) / 100 : ''} disabled={!writer} className="input w-32" />
                </Field>
                <Field label="Cap (₦)" hint="Percent fees only">
                  <input name="cap" type="number" step="0.01" min="0" defaultValue={row?.capKobo != null ? Number(row.capKobo) / 100 : ''} disabled={!writer} className="input w-32" />
                </Field>
                {writer && <button className="btn">Save</button>}
              </div>
            </form>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-ink-muted">
        Example: on a {formatKobo(1_000_000n)} gift the gifter pays the item price plus the transaction fee (and delivery fee if it ships); the merchant receives the price minus the commission.
      </p>
    </div>
  );
}
