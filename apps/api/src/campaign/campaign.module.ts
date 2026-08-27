import { Module } from '@nestjs/common';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DaneDivipolaClient } from './dane-divipola.client';

@Module({
  imports: [PrismaModule],
  controllers: [CampaignController],
  providers: [CampaignService, DaneDivipolaClient],
  exports: [CampaignService],
})
export class CampaignModule {}
