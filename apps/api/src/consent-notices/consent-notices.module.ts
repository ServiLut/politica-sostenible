import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConsentNoticesController } from './consent-notices.controller';
import { ConsentNoticesService } from './consent-notices.service';

@Module({
  imports: [PrismaModule],
  controllers: [ConsentNoticesController],
  providers: [ConsentNoticesService],
})
export class ConsentNoticesModule {}
