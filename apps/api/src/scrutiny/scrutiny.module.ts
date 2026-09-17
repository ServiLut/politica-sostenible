import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ScrutinyController } from './scrutiny.controller';
import { ScrutinyService } from './scrutiny.service';

@Module({
  imports: [PrismaModule],
  controllers: [ScrutinyController],
  providers: [ScrutinyService],
  exports: [ScrutinyService],
})
export class ScrutinyModule {}
