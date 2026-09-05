import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationalInboxController } from './operational-inbox.controller';
import { OperationalInboxService } from './operational-inbox.service';

@Module({
  imports: [PrismaModule],
  controllers: [OperationalInboxController],
  providers: [OperationalInboxService],
})
export class OperationalInboxModule {}
