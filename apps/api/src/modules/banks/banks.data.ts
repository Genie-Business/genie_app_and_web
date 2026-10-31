import type { Bank } from '../payments/provider/types';

/**
 * Nigerian banks and the main payment apps, keyed by NIP / CBN institution code.
 *
 * This is the list the app shows when the payment provider has no live one (the
 * mock provider, or a provider call that failed), so it only carries institutions
 * whose codes are stable and widely published. A configured provider's own list
 * takes precedence in banks.service.ts.
 */
export const NG_BANKS: readonly Bank[] = [
  { code: '044', name: 'Access Bank' },
  { code: '023', name: 'Citibank Nigeria' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank (FCMB)' },
  { code: '103', name: 'Globus Bank' },
  { code: '058', name: 'Guaranty Trust Bank (GTBank)' },
  { code: '030', name: 'Heritage Bank' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '068', name: 'Standard Chartered Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '100', name: 'Suntrust Bank' },
  { code: '102', name: 'Titan Trust Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa (UBA)' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '090267', name: 'Kuda Bank' },
  { code: '090405', name: 'Moniepoint Microfinance Bank' },
  { code: '100004', name: 'OPay' },
  { code: '100033', name: 'PalmPay' },
  { code: '100026', name: 'Carbon' },
  { code: '090110', name: 'VFD Microfinance Bank' },
  { code: '090325', name: 'Sparkle Microfinance Bank' },
  { code: '120001', name: '9mobile 9Payment Service Bank' },
];

const BY_CODE = new Map(NG_BANKS.map((b) => [b.code, b]));

/** The bundled bank for `code`, if we have it. */
export function bundledBank(code: string): Bank | undefined {
  return BY_CODE.get(code);
}
