import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal env so createApp() can boot for spec generation only.
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/genie';
process.env.JWT_ACCESS_SECRET ??= 'openapi-generation-secret-value';
process.env.JWT_REFRESH_SECRET ??= 'openapi-generation-secret-value';

const { createApp } = await import('../src/app');

const app = createApp();
const res = await app.request('/v1/openapi.json');
const doc = await res.json();

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${out}`);
