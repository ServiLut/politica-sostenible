import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CampaignModule } from './campaign/campaign.module';
import { VoterModule } from './voter/voter.module';
import { AiModule } from './ai/ai.module';
import { FinanceModule } from './finance/finance.module';
import { WitnessModule } from './witness/witness.module';
import { LogisticsModule } from './logistics/logistics.module';
import { ConfigModule } from '@nestjs/config';

import { HealthController } from './health.controller';
import { CommonModule } from './common/common.module';
import { VotingPlacesModule } from './voting-places/voting-places.module';
import { FilesModule } from './files/files.module';
import { OperationsModule } from './operations/operations.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { GisModule } from './gis/gis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    PrismaModule,
    AuthModule,
    CampaignModule,
    VoterModule,
    AiModule,
    FinanceModule,
    WitnessModule,
    LogisticsModule,
    VotingPlacesModule,
    FilesModule,
    OperationsModule,
    WhatsappModule,
    GisModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
