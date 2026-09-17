import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ElectoralCalendarController } from './electoral-calendar.controller';
import { ElectoralCalendarService } from './electoral-calendar.service';

@Module({
  imports: [PrismaModule],
  controllers: [ElectoralCalendarController],
  providers: [ElectoralCalendarService],
  exports: [ElectoralCalendarService],
})
export class ElectoralCalendarModule {}
