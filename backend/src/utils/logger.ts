import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

const isProduction = config.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: combine(
    errors({ stack: true }),
    timestamp(),
    isProduction ? json() : combine(colorize(), simple()),
  ),
  transports: [
    new winston.transports.Console(),
    ...(isProduction
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// Accepts both Pino-style log(obj, msg) and Winston-style log(msg, obj)
function makeMethod(child: winston.Logger, level: LogLevel) {
  return (msgOrObj: string | Record<string, unknown>, maybeMsg?: string) => {
    if (typeof msgOrObj === 'object' && typeof maybeMsg === 'string') {
      child[level](maybeMsg, msgOrObj);
    } else {
      child[level](msgOrObj as string);
    }
  };
}

export function createChildLogger(module: string) {
  const child = logger.child({ module });
  return {
    info:  makeMethod(child, 'info'),
    warn:  makeMethod(child, 'warn'),
    error: makeMethod(child, 'error'),
    debug: makeMethod(child, 'debug'),
  };
}
