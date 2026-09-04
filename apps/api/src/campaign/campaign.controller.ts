import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  CAMPAIGN_DIVISION_READ_ROLES,
  CampaignService,
} from './campaign.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Role } from '../../prisma/generated/prisma';
import { ListDivisionsQueryDto } from './dto/list-divisions-query.dto';
import { CreatePoliticalDivisionDto } from './dto/create-political-division.dto';
import { Throttle } from '@nestjs/throttler';

const CAMPAIGN_CONTEXT_READ_ROLES = [
  ...CAMPAIGN_DIVISION_READ_ROLES,
  Role.FINANCE_MANAGER,
  Role.COMMUNICATIONS_MANAGER,
];

@ApiTags('Campaigns')
@ApiBearerAuth()
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Post('init')
  @Roles(Role.ADMIN)
  @Throttle({
    default: { limit: 1, ttl: 600_000, blockDuration: 600_000 },
  })
  @ApiOperation({
    summary: 'Sincroniza la geografía electoral desde DANE DIVIPOLA MGN 2025',
  })
  async init(@CurrentUser() user: AuthenticatedUser) {
    return this.campaignService.initializeElectoralData(user);
  }

  @Get('divisions')
  @Roles(...CAMPAIGN_DIVISION_READ_ROLES)
  @ApiOperation({
    summary: 'Lista divisiones territoriales operativas de la campaña',
  })
  async findDivisions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDivisionsQueryDto,
  ) {
    return this.campaignService.findDivisions(user, query);
  }

  @Post('divisions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crea una zona o puesto dentro del tenant activo' })
  async createDivision(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePoliticalDivisionDto,
  ) {
    return this.campaignService.createDivision(user, dto);
  }

  @Get()
  @Roles(...CAMPAIGN_CONTEXT_READ_ROLES)
  @ApiOperation({ summary: 'Obtiene la campaña autenticada' })
  async findCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.campaignService.getCampaign(user.tenantId);
  }
}
