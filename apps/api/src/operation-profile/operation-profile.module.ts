import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationProfileController } from './operation-profile.controller';
import { OperationProfileService } from './operation-profile.service';
import { OperationStageAdoptionService } from './operation-stage-adoption.service';
import { OperationTerminationService } from './operation-termination.service';

@Module({
  imports: [PrismaModule],
  controllers: [OperationProfileController],
  providers: [
    OperationProfileService,
    OperationStageAdoptionService,
    OperationTerminationService,
  ],
  exports: [
    OperationProfileService,
    OperationStageAdoptionService,
    OperationTerminationService,
  ],
})
export class OperationProfileModule {}
