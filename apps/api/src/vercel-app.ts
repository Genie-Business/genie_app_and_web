import { handle } from 'hono/vercel';
import { createApp } from './app';

/** The Vercel serverless entry — bundled to dist/vercel.mjs by build-vercel.mjs. */
export const handler = handle(createApp());
