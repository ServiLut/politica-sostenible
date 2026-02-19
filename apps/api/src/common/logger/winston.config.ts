import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

export const winstonConfig = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        winston.format.colorize(),
        winston.format.printf((info: winston.Logform.TransformableInfo) => {
          const { timestamp, level, message, context, ms } = info;
          const ctx = typeof context === 'string' ? context : 'Application';
          const msg = typeof message === 'string' ? message : JSON.stringify(message);
          const t = typeof timestamp === 'string' ? timestamp : String(timestamp);
          const elapsed = typeof ms === 'string' ? ms : '';
          
          return `[Nest] ${t} ${level} [${ctx}] ${msg} ${elapsed}`;
        }),
      ),
    }),
  ],
});
