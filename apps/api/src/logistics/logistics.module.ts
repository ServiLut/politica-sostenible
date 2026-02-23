import { Module } from '@nestjs/common';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { LogisticsVotingModule } from './voting/logistics-voting.module';

@Module({
  imports: [LogisticsVotingModule],
  controllers: [LogisticsController],
  providers: [LogisticsService],
})
export class LogisticsModule {}
