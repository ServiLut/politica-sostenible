import { Controller, Post, Body } from '@nestjs/common';
import { LogisticsService, SyncE14Dto, SyncVoterDto } from './logistics.service';

@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Post('sync/e14')
  async syncE14(@Body() data: SyncE14Dto) {
    return this.logisticsService.syncE14(data);
  }

  @Post('sync/voter')
  async syncVoter(@Body() data: SyncVoterDto) {
    return this.logisticsService.syncVoter(data);
  }
}
