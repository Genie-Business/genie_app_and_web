import { getEnv } from '../env';
import { badRequest } from './errors';
import { logger } from './logger';

/**
 * Upload a file to Vercel Blob and return its public URL. Falls back to a
 * data-URI-free stub in local dev when no token is set (so KYC flows can be
 * exercised without cloud storage). Replace the stub with a proper local dir if
 * you need the bytes to persist.
 */
export async function uploadBlob(
  key: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<{ url: string; pathname: string }> {
  const env = getEnv();
  const size = data instanceof ArrayBuffer ? data.byteLength : data.byteLength;
  if (size > 8 * 1024 * 1024) throw badRequest('File too large (max 8MB).');

  if (!env.BLOB_READ_WRITE_TOKEN) {
    logger.warn({ key, size }, 'BLOB_READ_WRITE_TOKEN not set — returning stub URL');
    return { url: `https://blob.local/stub/${encodeURIComponent(key)}`, pathname: key };
  }

  const { put } = await import('@vercel/blob');
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as Uint8Array);
  const blob = await put(key, buffer, {
    access: 'public',
    contentType,
    token: env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: true,
  });
  return { url: blob.url, pathname: blob.pathname };
}
