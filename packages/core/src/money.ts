/**
 * Money helpers. genie stores every amount as an integer number of kobo
 * (1 NGN = 100 kobo) using BigInt. Never use floats for money.
 */

export const KOBO_PER_NAIRA = 100n;

export function nairaToKobo(naira: number | string): bigint {
  const [whole, frac = ''] = String(naira).split('.');
  const kobo = BigInt(whole || '0') * KOBO_PER_NAIRA + BigInt((frac + '00').slice(0, 2));
  return kobo;
}

export function koboToNaira(kobo: bigint): string {
  const negative = kobo < 0n;
  const abs = negative ? -kobo : kobo;
  const whole = abs / KOBO_PER_NAIRA;
  const frac = (abs % KOBO_PER_NAIRA).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function formatNaira(kobo: bigint): string {
  return `₦${Number(koboToNaira(kobo)).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type FeeRule = {
  type: 'PERCENT' | 'FLAT';
  /** For PERCENT: a percentage (e.g. 1.5 = 1.5%). For FLAT: kobo. */
  value: number;
  minKobo?: bigint | null;
  capKobo?: bigint | null;
};

/** Compute a fee in kobo from a rule and a base amount in kobo. */
export function computeFee(baseKobo: bigint, rule: FeeRule): bigint {
  let fee: bigint;
  if (rule.type === 'FLAT') {
    fee = BigInt(Math.round(rule.value));
  } else {
    // percent, rounded half-up, kept in integer kobo
    fee = (baseKobo * BigInt(Math.round(rule.value * 100))) / 10000n;
  }
  if (rule.minKobo != null && fee < rule.minKobo) fee = rule.minKobo;
  if (rule.capKobo != null && fee > rule.capKobo) fee = rule.capKobo;
  return fee;
}
