import { Module } from '@nestjs/common';
import { WitnessController } from './witness.controller';
import { WitnessService } from './witness.service';

@Module({
  controllers: [WitnessController],
  providers: [WitnessService],
  exports: [WitnessService],
})
export class WitnessModule {}
