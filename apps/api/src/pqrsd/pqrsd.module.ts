import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PqrsdController } from './pqrsd.controller';
import { PqrsdService } from './pqrsd.service';

@Module({
  imports: [PrismaModule],
  controllers: [PqrsdController],
  providers: [PqrsdService],
  exports: [PqrsdService],
})
export class PqrsdModule {}
