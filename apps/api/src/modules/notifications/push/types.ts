/**
 * Push-delivery abstraction. genie stores Notification rows regardless; a
 * PushSender is only the transport to the device.
 *
 *   - LogPushSender — writes to the logger. Default; needs no credentials.
 *   - FcmPushSender — Firebase Cloud Messaging (throws until FCM_* is set).
 */
export type PushMessage = {
  title: string;
  body: string;
  /** String map — FCM data payloads must be string→string. */
  data?: Record<string, string>;
};

export type PushResult = {
  sent: number;
  failed: number;
  /** Tokens the provider reported as permanently invalid — caller should prune. */
  invalidTokens: string[];
};

export interface PushSender {
  readonly name: string;
  send(tokens: string[], message: PushMessage): Promise<PushResult>;
}

export class PushNotConfiguredError extends Error {
  constructor(message = 'PUSH_PROVIDER=fcm but FCM credentials are not set.') {
    super(message);
    this.name = 'PushNotConfiguredError';
  }
}
