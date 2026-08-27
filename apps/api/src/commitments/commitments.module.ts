import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommitmentsController } from './commitments.controller';
import { CommitmentsService } from './commitments.service';

@Module({
  imports: [PrismaModule],
  controllers: [CommitmentsController],
  providers: [CommitmentsService],
  exports: [CommitmentsService],
})
export class CommitmentsModule {}
