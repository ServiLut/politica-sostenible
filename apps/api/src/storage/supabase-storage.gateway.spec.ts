import { ConfigService } from '@nestjs/config';
import { SupabaseStorageGateway } from './supabase-storage.gateway';

describe('SupabaseStorageGateway configuration', () => {
  it('fails fast when the Storage configuration is absent', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() => new SupabaseStorageGateway(configService)).toThrow(
      'SUPABASE_URL es obligatorio para Supabase Storage',
    );
  });
});
