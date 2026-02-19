import { Controller, Post, Get } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Post('init')
  @ApiOperation({ summary: 'Inicializa la geografía base y campaña demo' })
  async init() {
    return this.campaignService.initializeElectoralData();
  }

  @Get()
  @ApiOperation({ summary: 'Lista todas las campañas activas' })
  async findAll() {
    return this.campaignService.getCampaigns();
  }
}
