import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Role } from '../../prisma/generated/prisma';
import { ListDivisionsQueryDto } from './dto/list-divisions-query.dto';

const CAMPAIGN_DIVISION_READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
  Role.VOLUNTEER,
];
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
  @ApiOperation({
    summary: 'Sincroniza la geografía electoral desde DANE DIVIPOLA MGN 2025',
  })
  async init(@CurrentUser() user: AuthenticatedUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo un administrador puede inicializar');
    }

    return this.campaignService.initializeElectoralData(user.tenantId);
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
    return this.campaignService.findDivisions(user.tenantId, query);
  }

  @Get()
  @Roles(...CAMPAIGN_CONTEXT_READ_ROLES)
  @ApiOperation({ summary: 'Obtiene la campaña autenticada' })
  async findCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.campaignService.getCampaign(user.tenantId);
  }
}
