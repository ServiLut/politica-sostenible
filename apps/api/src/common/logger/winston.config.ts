import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

export const winstonConfig = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, context, ms }) => {
          const ctx =
            typeof context === 'string'
              ? context
              : context
                ? JSON.stringify(context)
                : 'Application';
          return `[Nest] ${String(timestamp)} ${String(level)} [${ctx}] ${String(message)} ${String(ms)}`;
        }),
      ),
    }),
  ],
});
