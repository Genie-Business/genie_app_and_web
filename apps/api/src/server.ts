import { serve } from '@hono/node-server';
import { createApp } from './app';
import { logger } from './lib/logger';

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`genie API listening on http://localhost:${info.port}`);
  logger.info(`OpenAPI: http://localhost:${info.port}/v1/openapi.json`);
});
