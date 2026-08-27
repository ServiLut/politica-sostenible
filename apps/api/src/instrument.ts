import * as Sentry from '@sentry/nestjs';

if (process.env.SENTRY_DSN) {
  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1);

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate,
    sendDefaultPii: false,
  });
}
