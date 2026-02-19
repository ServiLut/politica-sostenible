import { Controller, Post, Body } from '@nestjs/common';
import { LogisticsService } from './logistics.service';

@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Post('sync/e14')
  async syncE14(@Body() data: any) {
    return this.logisticsService.syncE14(data);
  }

  @Post('sync/voter')
  async syncVoter(@Body() data: any) {
    return this.logisticsService.syncVoter(data);
  }
}
