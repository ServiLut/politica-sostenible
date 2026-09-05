import { Module } from '@nestjs/common';
import { ElectionDayController } from './election-day.controller';
import { ElectionDayService } from './election-day.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ElectionDayController],
  providers: [ElectionDayService],
  exports: [ElectionDayService],
})
export class ElectionDayModule {}
