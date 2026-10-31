import { expect } from 'vitest';
import type { createApp } from '../../src/app';
import { body, post } from './factory';

type App = ReturnType<typeof createApp>;
type Auth = Record<string, string>;

const json = { 'content-type': 'application/json' };

/**
 * Pretend the buyer finished the hosted checkout for `reference`. Drives the same
 * path as Paystack's `charge.success` webhook (signed, verified, settled).
 * `amountKobo` lets a test simulate paying the wrong amount.
 */
export async function confirmPayment(app: App, reference: string, amountKobo?: number) {
  return app.request('/v1/payments/_mock/pay', post({ reference, ...(amountKobo ? { amountKobo } : {}) }, json));
}

/**
 * Pay for a gift the way a buyer does: start the checkout, then finish it. Returns the
 * checkout response (so a rejection such as "out of stock" can be asserted on) and, when
 * the checkout opened, its payment reference.
 */
export async function payForGift(app: App, auth: Auth, payload: Record<string, unknown>) {
  const res = await app.request('/v1/gifts', post(payload, auth));
  let reference: string | undefined;
  if (res.status === 201) {
    reference = (await body(res.clone())).data.reference as string;
    expect((await confirmPayment(app, reference)).status).toBe(200);
  }
  return { res, reference };
}
