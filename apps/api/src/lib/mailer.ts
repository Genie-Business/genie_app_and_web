import { getEnv } from '../env';
import { logger } from './logger';

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Send transactional mail via Resend (https://resend.com).
 *
 * Delivery is best-effort: if RESEND_API_KEY is unset, or Resend rejects the
 * send (e.g. the free tier only delivers to the account owner until a domain is
 * verified), the mail — including any OTP — is logged instead and the call still
 * resolves; it never throws, because throwing would 500 a registration whose user
 * row is already committed. Instead it reports whether the mail went out, so a caller
 * with nothing else to fall back on (a sign-up code, before any account exists) can
 * tell the user rather than claim "we sent it". Most callers ignore the result:
 * their codes are persisted and can be re-requested via `resend-otp`.
 *
 * Returns true when Resend accepted the mail, and also when there is no API key
 * outside production (local development reads the logged mail).
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const env = getEnv();
  if (!env.RESEND_API_KEY) {
    logger.info({ to: mail.to, subject: mail.subject, body: mail.text ?? mail.html }, '[dev mail]');
    return env.APP_ENV !== 'production';
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error(
        { status: res.status, detail, to: mail.to, subject: mail.subject, body: mail.text ?? mail.html },
        'Resend send failed, mail logged instead',
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error(
      { err, to: mail.to, subject: mail.subject, body: mail.text ?? mail.html },
      'Resend request threw, mail logged instead',
    );
    return false;
  }
}

export function otpEmail(code: string, purpose: 'verify' | 'reset' | 'delete'): Mail {
  const intro =
    purpose === 'verify'
      ? 'Use this code to verify your email and finish setting up your genie account:'
      : purpose === 'reset'
        ? 'Use this code to reset your genie password:'
        : 'Use this code to confirm deletion of your genie account:';
  return {
    to: '',
    subject: `Your genie code: ${code}`,
    text: `${intro}\n\n${code}\n\nThis code expires in 10 minutes. If you didn't request it, you can ignore this email.`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:440px;margin:auto">
      <h2 style="color:#6D28D9">genie</h2>
      <p style="color:#3F394E">${intro}</p>
      <p style="font-size:32px;letter-spacing:6px;font-weight:700;color:#2B1153">${code}</p>
      <p style="color:#716A81;font-size:13px">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
    </div>`,
  };
}

export function merchantCodeEmail(code: string): Mail {
  return {
    to: '',
    subject: `Your genie merchant code: ${code}`,
    text: `Use this code to confirm your email and continue setting up your genie merchant account:

${code}

This code expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:440px;margin:auto">
      <h2 style="color:#6D28D9">genie</h2>
      <p style="color:#3F394E">Use this code to confirm your email and continue setting up your genie merchant account:</p>
      <p style="font-size:32px;letter-spacing:6px;font-weight:700;color:#2B1153">${code}</p>
      <p style="color:#716A81;font-size:13px">This code expires in 10 minutes. If you didn't ask for it, ignore this email.</p>
    </div>`,
  };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The email that accompanies an in-app notification: the same title and text, in genie's frame,
 * so every notification can also reach someone's inbox without each caller writing a template.
 */
export function notificationEmail(opts: { title: string; body: string; ctaLabel?: string; ctaUrl?: string }): Omit<Mail, 'to'> {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<p style="margin-top:20px"><a href="${escapeHtml(opts.ctaUrl)}" style="background:#6D28D9;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(opts.ctaLabel)}</a></p>`
      : '';
  return {
    subject: opts.title,
    text: `${opts.body}${opts.ctaUrl ? `\n\n${opts.ctaUrl}` : ''}\n\n- genie`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#6D28D9">genie</h2>
      <h3 style="color:#2B1153;margin-bottom:6px">${escapeHtml(opts.title)}</h3>
      <p style="color:#3F394E;line-height:1.5">${escapeHtml(opts.body)}</p>${cta}
      <p style="color:#716A81;font-size:12px;margin-top:28px">You can choose which emails you get in the app under Settings > Notifications.</p>
    </div>`,
  };
}
