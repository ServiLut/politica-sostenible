import * as Sentry from '@sentry/nestjs';

const SENSITIVE_FIELD =
  /^(authorization|cookie|cookies|password|passcode|token|accessToken|refreshToken|email|phone|mobile|document|documentId|nationalId|query|query_string|body)$/i;
const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const COLOMBIAN_MOBILE_PATTERN = /(?:\+?57[\s.-]?)?3\d{2}(?:[\s.-]?\d){7}/g;

function stripUrlQuery(value: string): string {
  if (!/^(?:https?:\/\/|\/)/i.test(value)) return value;
  return value.split(/[?#]/, 1)[0] ?? value;
}

function scrubUnknown(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_FIELD.test(key)) return '[Filtered]';

  if (typeof value === 'string') {
    return stripUrlQuery(value)
      .replace(EMAIL_PATTERN, '[Filtered]')
      .replace(COLOMBIAN_MOBILE_PATTERN, '[Filtered]');
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubUnknown(item));
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([nestedKey, nestedValue]) => [
      nestedKey,
      scrubUnknown(nestedValue, nestedKey),
    ]),
  );
}

/** Removes request payloads, credentials and common Colombian voter PII. */
export function scrubSentryEvent<T extends object>(event: T): T {
  const scrubbed = scrubUnknown(event) as T;
  const eventRecord = scrubbed as Record<string, unknown>;
  delete eventRecord.user;

  if (eventRecord.request && typeof eventRecord.request === 'object') {
    const request = eventRecord.request as Record<string, unknown>;
    delete request.headers;
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    if (typeof request.url === 'string') {
      request.url = stripUrlQuery(request.url);
    }
  }

  return scrubbed;
}

if (process.env.SENTRY_DSN) {
  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1);

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate,
    sendDefaultPii: false,
    beforeSend: (event) => scrubSentryEvent(event),
    beforeSendTransaction: (event) => scrubSentryEvent(event),
  });
}
