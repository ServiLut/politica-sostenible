import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationProfileController } from './operation-profile.controller';
import { OperationProfileService } from './operation-profile.service';

@Module({
  imports: [PrismaModule],
  controllers: [OperationProfileController],
  providers: [OperationProfileService],
  exports: [OperationProfileService],
})
export class OperationProfileModule {}
