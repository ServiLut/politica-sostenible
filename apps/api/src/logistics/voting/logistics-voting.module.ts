import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LogisticsVotingService } from './logistics-voting.service';
import { LogisticsVotingController } from './logistics-voting.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [HttpModule, PrismaModule],
  providers: [LogisticsVotingService],
  controllers: [LogisticsVotingController],
  exports: [LogisticsVotingService],
})
export class LogisticsVotingModule {}
