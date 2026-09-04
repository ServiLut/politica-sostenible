import { Module } from '@nestjs/common';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { WitnessModule } from '../witness/witness.module';

@Module({
  imports: [WitnessModule],
  controllers: [LogisticsController],
  providers: [LogisticsService],
})
export class LogisticsModule {}
