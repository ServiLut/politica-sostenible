import { ConfigService } from '@nestjs/config';
import { ConsentEvidenceService } from './consent-evidence.service';

describe('ConsentEvidenceService', () => {
  const config = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  it('hashes the IP with the configured salt without retaining the raw value', () => {
    const service = new ConsentEvidenceService(
      config({ CONSENT_IP_SALT: 'test-consent-salt' }),
    );

    const hash = service.hashIp(' 203.0.113.42 ');

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('203.0.113.42');
    expect(hash).toBe(service.hashIp('203.0.113.42'));
  });

  it('requires a consent salt in production', () => {
    expect(
      () =>
        new ConsentEvidenceService(
          config({ NODE_ENV: 'production', CONSENT_IP_SALT: undefined }),
        ),
    ).toThrow('CONSENT_IP_SALT es obligatorio en producción');
  });
});
