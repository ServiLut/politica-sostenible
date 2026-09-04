import { Module } from '@nestjs/common';
import { VoterController } from './voter.controller';
import { VoterService } from './voter.service';
import { PrismaModule } from '../prisma/prisma.module';
import { VoterDataRightsService } from './voter-data-rights.service';

@Module({
  imports: [PrismaModule],
  controllers: [VoterController],
  providers: [VoterService, VoterDataRightsService],
})
export class VoterModule {}
