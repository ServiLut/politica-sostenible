import { scrubSentryEvent } from './instrument';

describe('Sentry privacy scrubber', () => {
  it('removes request payloads, query parameters, credentials and voter PII', () => {
    const result = scrubSentryEvent({
      message: 'Fallo para persona@example.test con teléfono +57 300 123 4567',
      user: { id: 'user-a', email: 'persona@example.test' },
      request: {
        url: 'https://api.example.test/voters?documentId=1234567890#detail',
        headers: { authorization: 'Bearer secret', cookie: 'session=secret' },
        query_string: 'documentId=1234567890',
        data: { phone: '3001234567' },
      },
      extra: {
        documentId: '1234567890',
        nested: { email: 'persona@example.test', safeCount: 4 },
      },
      breadcrumbs: [
        {
          data: {
            url: 'https://app.example.test/search?phone=3001234567',
            token: 'secret',
          },
        },
      ],
    });
    const serialized = JSON.stringify(result);

    expect(result).not.toHaveProperty('user');
    expect(result.request).toMatchObject({
      url: 'https://api.example.test/voters',
    });
    expect(result.request).not.toHaveProperty('headers');
    expect(result.request).not.toHaveProperty('query_string');
    expect(result.request).not.toHaveProperty('data');
    expect(serialized).not.toContain('persona@example.test');
    expect(serialized).not.toContain('3001234567');
    expect(serialized).not.toContain('1234567890');
    expect(serialized).not.toContain('Bearer secret');
    expect(serialized).not.toContain('?phone=');
    expect(serialized).toContain('safeCount');
  });
});
