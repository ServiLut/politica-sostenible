import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { SupabaseStorageGateway } from './supabase-storage.gateway';
import { StorageIntegrityByteReader } from './storage-integrity-byte-reader.service';
import { StorageIntegrityQueueModule } from './storage-integrity-queue.module';
import { StorageIntegrityVerificationService } from './storage-integrity-verification.service';

@Module({
  imports: [StorageIntegrityQueueModule],
  controllers: [StorageController],
  providers: [
    StorageService,
    SupabaseStorageGateway,
    StorageIntegrityByteReader,
    StorageIntegrityVerificationService,
  ],
  exports: [
    StorageService,
    SupabaseStorageGateway,
    StorageIntegrityQueueModule,
    StorageIntegrityVerificationService,
  ],
})
export class StorageModule {}
