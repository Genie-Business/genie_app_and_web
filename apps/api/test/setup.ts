import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Tiny .env loader (no dependency) — first file wins per key. */
function loadEnv(paths: string[]) {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1]!;
      if (process.env[key] != null) continue;
      let val = m[2]!.trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnv([
  resolve(__dirname, '../.env.test'),
  resolve(__dirname, '../.env.local'),
  resolve(__dirname, '../../../.env'),
]);

process.env.NODE_ENV = 'test';
process.env.APP_ENV ??= 'test';
process.env.PAYMENTS_PROVIDER ??= 'mock';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-not-for-production';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-not-for-production';
process.env.ANCHOR_WEBHOOK_SECRET ??= 'test-webhook-secret';
process.env.LOG_LEVEL ??= 'silent';
// A syntactically-valid placeholder so getEnv() (and thus createApp()) doesn't
// throw during test collection. Integration suites probe real connectivity via
// hasDb() and skip themselves when this points nowhere.
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/genie_test?schema=public';
