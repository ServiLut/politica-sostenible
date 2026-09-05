import { Module } from '@nestjs/common';
import { TransitionHandoverController } from './transition-handover.controller';
import { TransitionHandoverService } from './transition-handover.service';

@Module({
  controllers: [TransitionHandoverController],
  providers: [TransitionHandoverService],
})
export class TransitionHandoverModule {}
