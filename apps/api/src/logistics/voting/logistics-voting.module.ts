import { Module } from '@nestjs/common';
import { LogisticsVotingService } from './logistics-voting.service';
import { LogisticsVotingController } from './logistics-voting.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LogisticsVotingService],
  controllers: [LogisticsVotingController],
  exports: [LogisticsVotingService],
})
export class LogisticsVotingModule {}
