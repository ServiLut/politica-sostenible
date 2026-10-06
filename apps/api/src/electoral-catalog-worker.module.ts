import { ImportModule } from './import/import.module';
import { PersonImportProcessor } from './import/person-import.processor';
import { PersonImportRecoveryService } from './import/person-import-recovery.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ElectoralCatalogImportProcessor } from './electoral-catalog/electoral-catalog-import.processor';
import { ElectoralCatalogImportRecoveryService } from './electoral-catalog/electoral-catalog-import-recovery.service';
import { ElectoralCatalogWorkerHeartbeatService } from './electoral-catalog/electoral-catalog-worker-heartbeat.service';
import { ElectoralCatalogModule } from './electoral-catalog/electoral-catalog.module';
import { StorageIntegrityProcessor } from './storage/storage-integrity.processor';
import { StorageIntegrityRecoveryService } from './storage/storage-integrity-recovery.service';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ElectoralCatalogModule,
    ImportModule,
    StorageModule,
  ],
  providers: [
    ElectoralCatalogImportProcessor,
    PersonImportProcessor,
    PersonImportRecoveryService,
    ElectoralCatalogImportRecoveryService,
    ElectoralCatalogWorkerHeartbeatService,
    StorageIntegrityProcessor,
    StorageIntegrityRecoveryService,
  ],
})
export class ElectoralCatalogWorkerModule {}
