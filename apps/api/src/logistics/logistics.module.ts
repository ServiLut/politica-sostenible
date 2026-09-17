import { Module } from '@nestjs/common';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { WitnessModule } from '../witness/witness.module';
import { InventoryLogisticsController } from './inventory-logistics.controller';
import { InventoryOperationsService } from './inventory-operations.service';

@Module({
  imports: [WitnessModule],
  controllers: [LogisticsController, InventoryLogisticsController],
  providers: [LogisticsService, InventoryOperationsService],
})
export class LogisticsModule {}
