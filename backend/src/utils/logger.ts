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

export function createChildLogger(module: string) {
  return logger.child({ module });
}
