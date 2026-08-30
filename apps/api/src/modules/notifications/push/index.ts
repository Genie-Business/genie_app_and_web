import { getEnv } from '../../../env';
import { FcmPushSender } from './fcm';
import { LogPushSender } from './log';
import type { PushSender } from './types';

export * from './types';
export { LogPushSender } from './log';
export { FcmPushSender } from './fcm';

let override: PushSender | null = null;
let cached: PushSender | null = null;

/** Test hook — force a specific sender (or `null` to fall back to env). */
export function __setPushSender(sender: PushSender | null): void {
  override = sender;
  cached = null;
}

export function getPushSender(): PushSender {
  if (override) return override;
  if (cached) return cached;
  const env = getEnv();
  cached =
    env.PUSH_PROVIDER === 'fcm'
      ? new FcmPushSender({
          projectId: env.FCM_PROJECT_ID,
          clientEmail: env.FCM_CLIENT_EMAIL,
          privateKey: env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      : new LogPushSender();
  return cached;
}
