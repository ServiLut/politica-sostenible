import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommandCenterController } from './command-center.controller';
import { CommandCenterService } from './command-center.service';
import { ElectoralCalendarModule } from '../electoral-calendar/electoral-calendar.module';
import { PqrsdModule } from '../pqrsd/pqrsd.module';

@Module({
  imports: [PrismaModule, ElectoralCalendarModule, PqrsdModule],
  controllers: [CommandCenterController],
  providers: [CommandCenterService],
})
export class CommandCenterModule {}
