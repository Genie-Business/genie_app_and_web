import { logger } from '../../../lib/logger';
import type { PushMessage, PushResult, PushSender } from './types';

/** Dev / preview push sender — records the send in the log, delivers nothing. */
export class LogPushSender implements PushSender {
  readonly name = 'log';

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    logger.info(
      { tokens: tokens.length, title: message.title, body: message.body, data: message.data },
      '🔔 [dev push]',
    );
    return { sent: tokens.length, failed: 0, invalidTokens: [] };
  }
}
