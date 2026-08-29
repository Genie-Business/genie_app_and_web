import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
  redact: {
    paths: ['req.headers.authorization', '*.password', '*.passwordHash', '*.token', '*.refreshToken'],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
