import { Module } from '@nestjs/common';
import { WitnessController } from './witness.controller';
import { WitnessService } from './witness.service';
import { OfflineE14CaptureGrantService } from './offline-e14-capture-grant.service';
import { WitnessAssignmentController } from './witness-assignment.controller';
import { WitnessAssignmentService } from './witness-assignment.service';

@Module({
  controllers: [WitnessController, WitnessAssignmentController],
  providers: [
    WitnessService,
    OfflineE14CaptureGrantService,
    WitnessAssignmentService,
  ],
  exports: [
    WitnessService,
    OfflineE14CaptureGrantService,
    WitnessAssignmentService,
  ],
})
export class WitnessModule {}
