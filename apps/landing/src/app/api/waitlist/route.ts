import { NextResponse } from 'next/server';
import { site } from '@/lib/site';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'bad_request', message: 'Invalid JSON.' } }, { status: 400 });
  }

  const { email, source } = (body ?? {}) as { email?: string; source?: string };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return NextResponse.json(
      { error: { code: 'invalid_email', message: 'Enter a valid email address.' } },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(`${site.apiBaseUrl}/v1/waitlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, source: source ?? 'landing', referrer: req.headers.get('referer') ?? undefined }),
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: { code: 'upstream_unavailable', message: 'Could not reach the waitlist service. Try again shortly.' } },
      { status: 502 },
    );
  }
}
