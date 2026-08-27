import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditEventsController } from './audit-events.controller';
import { AuditEventsService } from './audit-events.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuditEventsController],
  providers: [AuditEventsService],
})
export class AuditEventsModule {}
