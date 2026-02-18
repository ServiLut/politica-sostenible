import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { CuentasClarasExporter } from './services/cuentas-claras-exporter.service';
import { CneLimitGuard } from './guards/cne-limit.guard';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, CuentasClarasExporter, CneLimitGuard],
  exports: [FinanceService, CuentasClarasExporter],
})
export class FinanceModule {}
