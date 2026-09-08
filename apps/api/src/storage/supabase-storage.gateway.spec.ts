import { ConfigService } from '@nestjs/config';
import { SupabaseStorageGateway } from './supabase-storage.gateway';

describe('SupabaseStorageGateway configuration', () => {
  const originalDeploymentProfile = process.env.DEPLOYMENT_PROFILE;

  afterEach(() => {
    if (originalDeploymentProfile === undefined) {
      delete process.env.DEPLOYMENT_PROFILE;
    } else {
      process.env.DEPLOYMENT_PROFILE = originalDeploymentProfile;
    }
  });

  const configuration = (overrides: Record<string, string> = {}) => {
    const values: Record<string, string> = {
      SUPABASE_URL: 'https://storage-ci.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'evaluation-only-storage-service-role-fixture',
      SUPABASE_STORAGE_BUCKET: 'politica-ci',
      ...overrides,
    };

    return {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
  };

  it('fails fast when the Storage configuration is absent', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() => new SupabaseStorageGateway(configService)).toThrow(
      'SUPABASE_URL es obligatorio para Supabase Storage',
    );
  });

  it('accepts the synthetic credential only for evaluation against a reserved host', () => {
    process.env.DEPLOYMENT_PROFILE = 'evaluation';

    expect(() => new SupabaseStorageGateway(configuration())).not.toThrow();
  });

  it('rejects the synthetic credential in production', () => {
    process.env.DEPLOYMENT_PROFILE = 'production';

    expect(() => new SupabaseStorageGateway(configuration())).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY debe ser una credencial service_role válida',
    );
  });

  it('rejects the synthetic credential against a real Storage host', () => {
    process.env.DEPLOYMENT_PROFILE = 'evaluation';

    expect(
      () =>
        new SupabaseStorageGateway(
          configuration({ SUPABASE_URL: 'https://project.supabase.co' }),
        ),
    ).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY debe ser una credencial service_role válida',
    );
  });
});
