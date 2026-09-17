import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FinanceCloseoutController } from './finance-closeout.controller';
import { FinanceCloseoutService } from './finance-closeout.service';

@Module({
  imports: [PrismaModule],
  controllers: [FinanceController, FinanceCloseoutController],
  providers: [FinanceService, FinanceCloseoutService],
  exports: [FinanceService, FinanceCloseoutService],
})
export class FinanceModule {}
