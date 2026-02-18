import * as Sentry from '@sentry/nestjs';

const integrations: any[] = [];

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nodeProfilingIntegration } = require('@sentry/profiling-node');
  integrations.push(nodeProfilingIntegration());
} catch (e) {
  console.warn('⚠️ Sentry Profiling could not be initialized:', e.message);
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations,
    // Performance Monitoring
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    sendDefaultPii: true,
  });
}
