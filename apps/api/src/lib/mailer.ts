import { getEnv } from '../env';
import { logger } from './logger';

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Send transactional mail via Resend (https://resend.com). If RESEND_API_KEY is
 * unset (local dev), the mail — including any OTP — is logged to the console
 * instead so flows are still testable end-to-end.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const env = getEnv();
  if (!env.RESEND_API_KEY) {
    logger.info({ to: mail.to, subject: mail.subject, body: mail.text ?? mail.html }, '📧 [dev mail]');
    return;
  }
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
    logger.error({ status: res.status, detail }, 'Resend send failed');
    throw new Error(`Email delivery failed (${res.status})`);
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
      <h2 style="color:#123E47">genie</h2>
      <p style="color:#3D4A50">${intro}</p>
      <p style="font-size:32px;letter-spacing:6px;font-weight:700;color:#123E47">${code}</p>
      <p style="color:#6E7F86;font-size:13px">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
    </div>`,
  };
}
