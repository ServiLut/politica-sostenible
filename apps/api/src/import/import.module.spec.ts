import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { IdentityService } from '../common/services/identity.service';
import { OfflineSyncService } from '../common/services/offline-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageGateway } from '../storage/supabase-storage.gateway';
import { ImportModule } from './import.module';
import { ImportService } from './import.service';
import { PersonImportService } from './person-import.service';
import { PersonImportProcessor } from './person-import.processor';

describe('Worker import dependency isolation', () => {
  it('resolves the real worker graph in production without API-only secrets', async () => {
    const previous = process.env.NODE_ENV;
    const originalForRoot = ConfigModule.forRoot.bind(
      ConfigModule,
    ) as typeof ConfigModule.forRoot;
    // Never load workspace .env files. Infrastructure adapters remain test
    // doubles here; the Docker smoke verifies live Redis/PG and lifecycle.
    const configuration = jest
      .spyOn(ConfigModule, 'forRoot')
      .mockImplementation((options) =>
        originalForRoot({
          ...options,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          skipProcessEnv: true,
          load: [() => ({ NODE_ENV: 'production' })],
        }),
      );
    let module:
      | Awaited<
          ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>
        >
      | undefined;
    try {
      // Queue-module registration was evaluated under Jest's test environment;
      // constructors below receive production configuration without secrets.
      const { ElectoralCatalogWorkerModule } =
        await import('../electoral-catalog-worker.module');
      process.env.NODE_ENV = 'production';
      module = await Test.createTestingModule({
        imports: [ElectoralCatalogWorkerModule],
      })
        .overrideProvider(PrismaService)
        .useValue({})
        .overrideProvider(SupabaseStorageGateway)
        .useValue({})
        .compile();
      const config = module.get(ConfigService);
      expect(config.get('NODE_ENV')).toBe('production');
      expect(config.get('CONSENT_IP_SALT')).toBeUndefined();
      expect(config.get('OFFLINE_SYNC_HMAC_SECRET')).toBeUndefined();
      expect(module.get(ImportService)).toBeInstanceOf(ImportService);
      expect(module.get(PersonImportService)).toBeInstanceOf(
        PersonImportService,
      );
      expect(module.get(PersonImportProcessor)).toBeInstanceOf(
        PersonImportProcessor,
      );
      expect(module.get(IdentityService).validateCedula('123456789')).toBe(
        true,
      );
      expect(() => module!.get(ConsentEvidenceService)).toThrow();
      expect(() => module!.get(OfflineSyncService)).toThrow();
    } finally {
      await module?.close();
      configuration.mockRestore();
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('resolves import services when used independently from the API CommonModule', async () => {
    const module = await Test.createTestingModule({ imports: [ImportModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(SupabaseStorageGateway)
      .useValue({})
      .compile();
    try {
      expect(module.get(ImportService)).toBeInstanceOf(ImportService);
      expect(module.get(PersonImportService)).toBeInstanceOf(
        PersonImportService,
      );
      expect(module.get(IdentityService).validateCedula('INVALID')).toBe(false);
    } finally {
      await module.close();
    }
  });
});
