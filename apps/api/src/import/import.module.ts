import { Module } from '@nestjs/common';
import { IdentityService } from '../common/services/identity.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { PersonImportController } from './person-import.controller';
import { PersonImportService } from './person-import.service';
import { PersonImportArtifactService } from './person-import-artifact.service';
import { PersonImportQueueModule } from './person-import-queue.module';
@Module({
  imports: [PrismaModule, StorageModule, PersonImportQueueModule],
  controllers: [PersonImportController, ImportController],
  // This module also runs in the isolated worker. It needs only the pure
  // identity validator, not API-only consent hashing or offline-signing keys.
  providers: [
    IdentityService,
    ImportService,
    PersonImportService,
    PersonImportArtifactService,
  ],
  exports: [PersonImportService, PersonImportQueueModule],
})
export class ImportModule {}
