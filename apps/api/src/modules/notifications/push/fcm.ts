import { logger } from '../../../lib/logger';
import { PushNotConfiguredError, type PushMessage, type PushResult, type PushSender } from './types';

export type FcmConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

/**
 * Firebase Cloud Messaging HTTP v1 sender. Skeleton only — the OAuth2
 * service-account token exchange and the per-token POST to
 * `https://fcm.googleapis.com/v1/projects/{projectId}/messages:send` land when a
 * Firebase project exists. Until then every call throws PushNotConfiguredError,
 * which the notification service swallows (in-app delivery still works).
 */
export class FcmPushSender implements PushSender {
  readonly name = 'fcm';

  constructor(private readonly config: FcmConfig) {}

  private assertConfigured(): void {
    if (!this.config.projectId || !this.config.clientEmail || !this.config.privateKey) {
      throw new PushNotConfiguredError();
    }
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    this.assertConfigured();
    // TODO(payments-milestone follow-up): mint a service-account access token,
    // then fan out one messages:send call per token, collecting UNREGISTERED /
    // INVALID_ARGUMENT responses into invalidTokens.
    logger.warn({ tokens: tokens.length, title: message.title }, 'FcmPushSender.send not implemented');
    throw new PushNotConfiguredError('FcmPushSender is not implemented yet.');
  }
}
