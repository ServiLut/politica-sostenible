import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { WitnessService } from './witness.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateWitnessReportDto } from './dto/create-witness-report.dto';
import { ListWitnessReportsQueryDto } from './dto/list-witness-reports-query.dto';
import { ReviewWitnessReportDto } from './dto/review-witness-report.dto';
import { UpdatePollingPlaceProfileDto } from './dto/update-polling-place-profile.dto';
import {
  PollingPlaceParamsDto,
  WitnessReportParamsDto,
} from './dto/witness-params.dto';
import { PoliticalOperationStage, Role } from '../../prisma/generated/prisma';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  BlockWhenOperationClosed,
  RequireOperationStages,
} from '../auth/decorators/operation-stage-policy.decorator';
import { OfflineE14CaptureGrantService } from './offline-e14-capture-grant.service';

const E14_PERSISTENCE_STAGES = [
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
];

const POLLING_PLACE_CONFIGURATION_STAGES = [
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
];

const WITNESS_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];
const WITNESS_READ_ROLES = [
  ...WITNESS_WRITE_ROLES,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
const WITNESS_REVIEW_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.ZONE_COORDINATOR,
];
const WITNESS_PROFILE_ROLES = [Role.ADMIN, Role.CAMPAIGN_MANAGER];

@ApiTags('Witnesses')
@ApiBearerAuth()
@BlockWhenOperationClosed()
@Controller('witnesses')
export class WitnessController {
  constructor(
    private readonly witnessService: WitnessService,
    private readonly offlineE14Grants?: OfflineE14CaptureGrantService,
  ) {}

  @Post('offline-capture-grants')
  @RequireOperationStages(
    PoliticalOperationStage.SIMULATION,
    PoliticalOperationStage.ELECTION_DAY,
  )
  @Roles(...WITNESS_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Provisionar una capacidad E-14 offline opaca, acotada y registrada',
  })
  provisionOfflineCaptureGrant(@CurrentUser() user: AuthenticatedUser) {
    return this.requireOfflineE14Grants().provision(user);
  }

  @Delete('offline-capture-grants')
  @Roles(...WITNESS_WRITE_ROLES)
  @ApiOperation({ summary: 'Revocar capacidades E-14 offline vigentes' })
  revokeOfflineCaptureGrants(@CurrentUser() user: AuthenticatedUser) {
    return this.requireOfflineE14Grants().revoke(user);
  }

  @Post()
  @RequireOperationStages(...E14_PERSISTENCE_STAGES)
  @Roles(...WITNESS_WRITE_ROLES)
  @ApiOperation({
    summary: 'Registrar internamente un reporte E-14 para conciliacion',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWitnessReportDto,
  ) {
    return this.witnessService.create(user.tenantId, user.userId, dto);
  }

  @Get()
  @Roles(...WITNESS_READ_ROLES)
  @ApiOperation({ summary: 'Listar y resumir la conciliacion interna E-14' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWitnessReportsQueryDto,
  ) {
    return this.witnessService.findAll(user.tenantId, user.userId, query);
  }

  @Patch(':id/review')
  @RequireOperationStages(...E14_PERSISTENCE_STAGES)
  @Roles(...WITNESS_REVIEW_ROLES)
  @ApiOperation({ summary: 'Aceptar o rechazar un reporte E-14 pendiente' })
  async review(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: WitnessReportParamsDto,
    @Body() dto: ReviewWitnessReportDto,
  ) {
    return this.witnessService.review(
      user.tenantId,
      user.userId,
      params.id,
      dto,
    );
  }

  @Put('places/:puestoId/profile')
  @RequireOperationStages(...POLLING_PLACE_CONFIGURATION_STAGES)
  @Roles(...WITNESS_PROFILE_ROLES)
  @ApiOperation({ summary: 'Configurar las mesas esperadas de un puesto' })
  async updatePollingPlaceProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PollingPlaceParamsDto,
    @Body() dto: UpdatePollingPlaceProfileDto,
  ) {
    return this.witnessService.updatePollingPlaceProfile(
      user.tenantId,
      user.userId,
      params.puestoId,
      dto,
    );
  }

  private requireOfflineE14Grants(): OfflineE14CaptureGrantService {
    if (!this.offlineE14Grants) {
      throw new Error('OfflineE14CaptureGrantService no fue configurado');
    }
    return this.offlineE14Grants;
  }
}
