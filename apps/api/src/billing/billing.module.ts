import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanLimitsService } from '../auth/guards/plan-limits.guard';

@Module({
  imports: [PrismaModule],
  providers: [BillingService, PlanLimitsService],
  controllers: [BillingController],
  exports: [BillingService, PlanLimitsService],
})
export class BillingModule {}
