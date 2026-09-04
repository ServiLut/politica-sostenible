import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  VOTER_CAPTURE_ROLES,
  VOTER_READ_ROLES,
  VoterService,
} from './voter.service';
import { CreateVoterDto } from './dto/create-voter.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Role } from '../../prisma/generated/prisma';
import { ListVotersQueryDto } from './dto/list-voters-query.dto';
import { SearchVotersDto } from './dto/search-voters.dto';
import { RevokeVoterConsentDto } from './dto/revoke-voter-consent.dto';
import { UpdateVoterDataDto } from './dto/update-voter-data.dto';
import { VoterDataRightsParamsDto } from './dto/voter-data-rights-params.dto';
import {
  VOTER_DATA_RIGHTS_ROLES,
  VoterDataRightsService,
} from './voter-data-rights.service';

const VOTER_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
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
  constructor(
    private readonly voterService: VoterService,
    private readonly voterDataRightsService: VoterDataRightsService,
  ) {}

  @Post()
  @Roles(...VOTER_WRITE_ROLES)
  @ApiOperation({ summary: 'Registra un nuevo votante' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVoterDto,
    @Ip() consentIp: string,
  ) {
    return this.voterService.create(user, consentIp, dto);
  }

  @Post('search')
  @Roles(...VOTER_READ_ROLES)
  @ApiOperation({
    summary:
      'Busca votantes sin exponer documento o celular en la URL de solicitud',
  })
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SearchVotersDto,
  ) {
    return this.voterService.search(user, dto);
  }

  @Get('capture-context')
  @Roles(...VOTER_CAPTURE_ROLES)
  @ApiOperation({
    summary: 'Lista únicamente los puestos habilitados para la captura actual',
  })
  async getCaptureContext(@CurrentUser() user: AuthenticatedUser) {
    return this.voterService.getCaptureContext(user);
  }

  @Get()
  @Roles(...VOTER_READ_ROLES)
  @ApiOperation({ summary: 'Lista todos los votantes de la campaña' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListVotersQueryDto,
  ) {
    return this.voterService.findAll(user, query);
  }

  @Get('stats')
  @Roles(...VOTER_READ_ROLES)
  @ApiOperation({ summary: 'Obtiene estadísticas de la campaña' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.voterService.getStats(user);
  }

  @Get(':id/export')
  @Roles(...VOTER_DATA_RIGHTS_ROLES)
  @ApiOperation({
    summary: 'Exporta los datos del ciudadano en JSON portable y auditable',
  })
  async exportPortable(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: VoterDataRightsParamsDto,
  ) {
    return this.voterDataRightsService.exportPortable(user, params.id);
  }

  @Get(':id')
  @Roles(...VOTER_DATA_RIGHTS_ROLES)
  @ApiOperation({
    summary:
      'Consulta la ficha privada completa del ciudadano y audita el acceso',
  })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: VoterDataRightsParamsDto,
  ) {
    return this.voterDataRightsService.findOne(user, params.id);
  }

  @Patch(':id')
  @Roles(...VOTER_DATA_RIGHTS_ROLES)
  @ApiOperation({
    summary: 'Corrige los datos personales permitidos y audita la operacion',
  })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: VoterDataRightsParamsDto,
    @Body() dto: UpdateVoterDataDto,
  ) {
    return this.voterDataRightsService.update(user, params.id, dto);
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
