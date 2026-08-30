import { createServer } from 'node:http';
const { handler } = await import('./dist/vercel.mjs');
const srv = createServer((req, res) => handler(req, res));
srv.listen(8799, async () => {
  for (const p of ['/v1/health', '/v1/fees', '/v1/categories?pageSize=2', '/v1/openapi.json']) {
    try {
      const r = await fetch('http://localhost:8799' + p);
      const t = await r.text();
      console.log(p, '->', r.status, t.slice(0, 100));
    } catch (e) { console.log(p, 'ERR', e.message); }
  }
  srv.close(); process.exit(0);
});
