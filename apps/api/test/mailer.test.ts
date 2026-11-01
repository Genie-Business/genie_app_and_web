import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnv } from '../src/env';
import { notificationEmail, sendMail } from '../src/lib/mailer';

const mail = { to: 'ada@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' };

/** getEnv() is cached; flip the fields sendMail reads for the length of one test. */
function withEnv(patch: Partial<ReturnType<typeof getEnv>>) {
  const env = getEnv();
  const before = { ...env };
  Object.assign(env, patch);
  return () => Object.assign(env, before);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendMail reports whether the mail went out', () => {
  it('is true when Resend accepts it', async () => {
    const restore = withEnv({ RESEND_API_KEY: 're_test', APP_ENV: 'production' });
    const fetchMock = vi.fn(async () => new Response('{"id":"abc"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendMail(mail)).toBe(true);
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent).toMatchObject({ to: 'ada@example.com', subject: 'Hi' });
    restore();
  });

  it('is false, without throwing, when Resend refuses it (an unverified sender domain, say)', async () => {
    const restore = withEnv({ RESEND_API_KEY: 're_test', APP_ENV: 'production' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"The genieapps.co domain is not verified"}', { status: 403 })));
    expect(await sendMail(mail)).toBe(false);
    restore();
  });

  it('is false, without throwing, when Resend cannot be reached', async () => {
    const restore = withEnv({ RESEND_API_KEY: 're_test', APP_ENV: 'production' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('network down'))));
    expect(await sendMail(mail)).toBe(false);
    restore();
  });

  it('with no API key: fine for local development, a failure in production', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    let restore = withEnv({ RESEND_API_KEY: '', APP_ENV: 'local' });
    expect(await sendMail(mail)).toBe(true);
    restore();

    restore = withEnv({ RESEND_API_KEY: '', APP_ENV: 'production' });
    expect(await sendMail(mail)).toBe(false);
    restore();

    expect(fetchMock).not.toHaveBeenCalled(); // nothing is sent without a key
  });
});

describe('notificationEmail', () => {
  it('puts the title and text in genie\'s frame, with an optional button', () => {
    const m = notificationEmail({ title: 'Payment received', body: 'We received your payment.', ctaLabel: 'Open genie', ctaUrl: 'https://www.getgenie.gift' });
    expect(m.subject).toBe('Payment received');
    expect(m.text).toContain('We received your payment.');
    expect(m.text).toContain('https://www.getgenie.gift');
    expect(m.html).toContain('Open genie');
  });

  it('escapes anything a person typed (names, messages) so it cannot inject markup', () => {
    const m = notificationEmail({ title: 'Hi <b>x</b>', body: '<script>alert(1)</script> & more' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('&amp; more');
  });
});
