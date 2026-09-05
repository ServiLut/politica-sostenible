import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [RetentionService],
})
export class RetentionModule {}
