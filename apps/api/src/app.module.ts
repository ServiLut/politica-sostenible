import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CampaignModule } from './campaign/campaign.module';
import { VoterModule } from './voter/voter.module';
import { FinanceModule } from './finance/finance.module';
import { WitnessModule } from './witness/witness.module';
import { LogisticsModule } from './logistics/logistics.module';
import { StorageModule } from './storage/storage.module';
import { TasksModule } from './tasks/tasks.module';
import { CommitmentsModule } from './commitments/commitments.module';
import { ProposalsModule } from './proposals/proposals.module';
import { CasesModule } from './cases/cases.module';
import { CommunicationsModule } from './communications/communications.module';
import { TeamModule } from './team/team.module';
import { AuditEventsModule } from './audit-events/audit-events.module';
import { EventsModule } from './events/events.module';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller';
import { CommonModule } from './common/common.module';
import { CommandCenterModule } from './command-center/command-center.module';
import { InteractionsModule } from './interactions/interactions.module';
import { ConsentNoticesModule } from './consent-notices/consent-notices.module';
import { RetentionModule } from './retention/retention.module';
import { ExportModule } from './export/export.module';
import { ImportModule } from './import/import.module';
import { ElectionDayModule } from './election-day/election-day.module';
import { SaasAdminModule } from './saas-admin/saas-admin.module';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ElectronicSignatureModule } from './electronic-signature/electronic-signature.module';
import { TransitionHandoverModule } from './transition-handover/transition-handover.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
        blockDuration: 60_000,
      },
    ]),
    CommonModule,
    PrismaModule,
    AuthModule,
    CampaignModule,
    VoterModule,
    FinanceModule,
    WitnessModule,
    LogisticsModule,
    StorageModule,
    TasksModule,
    CommitmentsModule,
    ProposalsModule,
    CasesModule,
    CommunicationsModule,
    TeamModule,
    AuditEventsModule,
    EventsModule,
    CommandCenterModule,
    InteractionsModule,
    ConsentNoticesModule,
    ScheduleModule.forRoot(),
    RetentionModule,
    ExportModule,
    ImportModule,
    ElectionDayModule,
    SaasAdminModule,
    BillingModule,
    NotificationsModule,
    ElectronicSignatureModule,
    TransitionHandoverModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
