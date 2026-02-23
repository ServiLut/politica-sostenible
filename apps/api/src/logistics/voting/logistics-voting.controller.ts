import { Controller, Get, Query, Post, Logger } from '@nestjs/common';
import { LogisticsVotingService } from './logistics-voting.service';

@Controller('logistics/voting-places')
export class LogisticsVotingController {
  private readonly logger = new Logger(LogisticsVotingController.name);

  constructor(
    private readonly logisticsVotingService: LogisticsVotingService,
  ) {}

  @Get()
  async getVotingPlaces(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('municipio') municipio?: string,
  ) {
    return this.logisticsVotingService.getVotingPlaces(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      municipio,
    );
  }

  @Post('sync')
  async syncVotingPlaces() {
    this.logger.log('Sincronizando puestos de votación...');
    const total = await this.logisticsVotingService.syncFromSocrata();
    return { success: true, total };
  }
}
