import { Module, OnModuleInit } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [BillingService],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule implements OnModuleInit {
  constructor(private readonly billingService: BillingService) {}

  async onModuleInit() {
    await this.billingService.seedDefaultPlans();
  }
}
