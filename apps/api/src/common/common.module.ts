import { Module, Global } from '@nestjs/common';
import { IdentityService } from './services/identity.service';
import { ConsentEvidenceService } from './services/consent-evidence.service';

@Global()
@Module({
  providers: [IdentityService, ConsentEvidenceService],
  exports: [IdentityService, ConsentEvidenceService],
})
export class CommonModule {}
