import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { PersonImportController } from './person-import.controller';
import { PersonImportService } from './person-import.service';
import { PersonImportArtifactService } from './person-import-artifact.service';
import { PersonImportQueueModule } from './person-import-queue.module';
@Module({
  imports: [PrismaModule, CommonModule, StorageModule, PersonImportQueueModule],
  controllers: [PersonImportController, ImportController],
  providers: [ImportService, PersonImportService, PersonImportArtifactService],
  exports: [PersonImportService, PersonImportQueueModule],
})
export class ImportModule {}
