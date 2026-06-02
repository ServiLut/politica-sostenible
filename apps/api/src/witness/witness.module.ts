import { Module } from '@nestjs/common';
import { WitnessController } from './witness.controller';
import { WitnessService } from './witness.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [WitnessController],
  providers: [WitnessService],
  exports: [WitnessService],
})
export class WitnessModule {}
