import { Module, Global } from '@nestjs/common';
import { IdentityService } from './services/identity.service';
import { ConsentEvidenceService } from './services/consent-evidence.service';
import { OfflineSyncService } from './services/offline-sync.service';

@Global()
@Module({
  providers: [IdentityService, ConsentEvidenceService, OfflineSyncService],
  exports: [IdentityService, ConsentEvidenceService, OfflineSyncService],
})
export class CommonModule {}
