import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { SupabaseStorageGateway } from './supabase-storage.gateway';

@Module({
  controllers: [StorageController],
  providers: [StorageService, SupabaseStorageGateway],
  exports: [StorageService],
})
export class StorageModule {}
