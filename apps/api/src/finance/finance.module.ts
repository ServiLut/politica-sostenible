import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { CuentasClarasExporter } from './services/cuentas-claras-exporter.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, CuentasClarasExporter],
  exports: [FinanceService, CuentasClarasExporter],
})
export class FinanceModule {}
