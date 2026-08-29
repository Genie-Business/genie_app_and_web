import { computeFee, type FeeRule } from '@genie/core';
import { prisma, type DeliveryOption, type FeeKey } from '@genie/db';

type Rules = Record<FeeKey, FeeRule>;

let cache: { at: number; rules: Rules } | null = null;
const TTL = 60_000;

const DEFAULTS: Rules = {
  TRANSACTION_FEE: { type: 'PERCENT', value: 1.5 },
  PRODUCT_FEE: { type: 'PERCENT', value: 5 },
  LOGISTICS_FEE: { type: 'FLAT', value: 150_000 }, // ₦1,500
};

/** Load the admin-editable fee configuration (cached). */
export async function getFeeRules(): Promise<Rules> {
  if (cache && Date.now() - cache.at < TTL) return cache.rules;
  const rows = await prisma.feeConfig.findMany();
  const rules = { ...DEFAULTS };
  for (const r of rows) {
    rules[r.key] = {
      type: r.type,
      value: Number(r.value),
      minKobo: r.minKobo ?? undefined,
      capKobo: r.capKobo ?? undefined,
    };
  }
  cache = { at: Date.now(), rules };
  return rules;
}

export function invalidateFeeCache() {
  cache = null;
}

export type GiftCharge = {
  quantity: number;
  subtotalKobo: bigint;
  /** gifter-side, on top */
  transactionFeeKobo: bigint;
  /** gifter-side, flat, only when the item is delivered */
  logisticsFeeKobo: bigint;
  /** what the gifter pays in total */
  gifterPaysKobo: bigint;
  /** merchant-side, deducted from proceeds */
  commissionKobo: bigint;
  /** what lands in the merchant wallet */
  merchantReceivesKobo: bigint;
  /** what genie keeps */
  genieRetainsKobo: bigint;
};

export async function computeGiftCharge(input: {
  unitPriceKobo: bigint;
  quantity: number;
  deliveryOption: DeliveryOption;
}): Promise<GiftCharge> {
  const rules = await getFeeRules();
  const subtotal = input.unitPriceKobo * BigInt(input.quantity);

  const transactionFee = computeFee(subtotal, rules.TRANSACTION_FEE);
  const logisticsFee =
    input.deliveryOption === 'PICKUP' ? 0n : computeFee(0n, rules.LOGISTICS_FEE);
  const commission = computeFee(subtotal, rules.PRODUCT_FEE);

  return {
    quantity: input.quantity,
    subtotalKobo: subtotal,
    transactionFeeKobo: transactionFee,
    logisticsFeeKobo: logisticsFee,
    gifterPaysKobo: subtotal + transactionFee + logisticsFee,
    commissionKobo: commission,
    merchantReceivesKobo: subtotal - commission,
    genieRetainsKobo: transactionFee + logisticsFee + commission,
  };
}

/** Human-readable current fee schedule (for the /fees endpoints). */
export async function feeSchedule() {
  const r = await getFeeRules();
  const fmt = (rule: FeeRule) =>
    rule.type === 'PERCENT' ? `${rule.value}%` : `₦${(rule.value / 100).toLocaleString()}`;
  return {
    transactionFee: { ...r.TRANSACTION_FEE, label: fmt(r.TRANSACTION_FEE), appliesTo: 'gifter, on top of the item price' },
    commission: { ...r.PRODUCT_FEE, label: fmt(r.PRODUCT_FEE), appliesTo: "merchant, deducted from the item's proceeds" },
    logisticsFee: { ...r.LOGISTICS_FEE, label: fmt(r.LOGISTICS_FEE), appliesTo: 'gifter, when the item is delivered (not pickup)' },
  };
}
