import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ElectoralCatalogController } from './electoral-catalog.controller';
import { ElectoralCatalogImportController } from './electoral-catalog-import.controller';
import { ElectoralCatalogArtifactService } from './electoral-catalog-artifact.service';
import { ElectoralCatalogImportService } from './electoral-catalog-import.service';
import { ElectoralCatalogQueueModule } from './electoral-catalog-queue.module';
import { ElectoralCatalogService } from './electoral-catalog.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule, ElectoralCatalogQueueModule],
  controllers: [ElectoralCatalogController, ElectoralCatalogImportController],
  providers: [
    ElectoralCatalogService,
    ElectoralCatalogArtifactService,
    ElectoralCatalogImportService,
  ],
  exports: [
    ElectoralCatalogService,
    ElectoralCatalogImportService,
    ElectoralCatalogQueueModule,
  ],
})
export class ElectoralCatalogModule {}
