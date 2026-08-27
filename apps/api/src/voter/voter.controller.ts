import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { VoterService } from './voter.service';
import { CreateVoterDto } from './dto/create-voter.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Role } from '../../prisma/generated/prisma';
import { ListVotersQueryDto } from './dto/list-voters-query.dto';
import { RevokeVoterConsentDto } from './dto/revoke-voter-consent.dto';

const VOTER_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
];
const VOTER_READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
];
const VOTER_CONSENT_REVOKE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
];

@ApiTags('Voters')
@ApiBearerAuth()
@Controller('voters')
export class VoterController {
  constructor(private readonly voterService: VoterService) {}

  @Post()
  @Roles(...VOTER_WRITE_ROLES)
  @ApiOperation({ summary: 'Registra un nuevo votante' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVoterDto,
    @Ip() consentIp: string,
  ) {
    return this.voterService.create(user.tenantId, user.userId, consentIp, dto);
  }

  @Get()
  @Roles(...VOTER_READ_ROLES)
  @ApiOperation({ summary: 'Lista todos los votantes de la campaña' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListVotersQueryDto,
  ) {
    return this.voterService.findAll(user.tenantId, query);
  }

  @Get('stats')
  @Roles(...VOTER_READ_ROLES)
  @ApiOperation({ summary: 'Obtiene estadísticas de la campaña' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.voterService.getStats(user.tenantId);
  }

  @Post(':id/consents/revoke')
  @Roles(...VOTER_CONSENT_REVOKE_ROLES)
  @ApiOperation({ summary: 'Revoca el consentimiento sin borrar su historial' })
  async revokeConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') voterId: string,
    @Body() dto: RevokeVoterConsentDto,
  ) {
    return this.voterService.revokeConsent(user, voterId, dto);
  }
}
