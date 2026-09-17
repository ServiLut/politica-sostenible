import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RetentionGovernanceController } from './retention-governance.controller';
import { RetentionGovernanceService } from './retention-governance.service';

@Module({
  imports: [PrismaModule],
  controllers: [RetentionGovernanceController],
  providers: [RetentionGovernanceService],
  exports: [RetentionGovernanceService],
})
export class RetentionGovernanceModule {}
