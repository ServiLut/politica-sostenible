import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { OfflineIncidentController } from './offline-incident.controller';
import { OfflineIncidentService } from './offline-incident.service';

@Module({
  imports: [PrismaModule],
  controllers: [CasesController, OfflineIncidentController],
  providers: [CasesService, OfflineIncidentService],
  exports: [CasesService],
})
export class CasesModule {}
