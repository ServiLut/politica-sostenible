import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PoliticalOperationStage, Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  BlockWhenOperationClosed,
  RequireOperationStages,
} from '../auth/decorators/operation-stage-policy.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  AddScrutinyActionVersionDto,
  ApproveScrutinyActionDto,
  ConfigureScrutinyRequirementDto,
  CreateScrutinyActionDto,
  CreateScrutinyCommissionDto,
  CreateScrutinyCoverageDto,
  CreateScrutinyDeclarationDto,
  CreateScrutinyDiscrepancyDto,
  CreateScrutinyDocumentDto,
  FileScrutinyActionDto,
  ListScrutinyQueryDto,
  RecordScrutinyCustodyEventDto,
  RecordScrutinyDecisionDto,
  RecordScrutinySessionEventDto,
  ResolveScrutinyDiscrepancyDto,
  ReviewScrutinyDecisionDto,
  ReviewScrutinyDeclarationDto,
  ReviewScrutinyDocumentDto,
  ScrutinyResourceParamsDto,
} from './dto/scrutiny.dto';
import { ListScrutinyParticipantsQueryDto } from './dto/list-scrutiny-participants-query.dto';
import { ScrutinyService } from './scrutiny.service';

const READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;
const LEGAL_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
] as const;
const FIELD_ROLES = [
  ...LEGAL_ROLES,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;
const SCRUTINY_STAGES = [
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
] as const;

@ApiTags('Post-election scrutiny')
@ApiBearerAuth()
@BlockWhenOperationClosed()
@Controller('scrutiny')
export class ScrutinyController {
  constructor(private readonly scrutiny: ScrutinyService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary:
      'Consulta el expediente tenant-scoped y separa datos internos, radicados, decididos y oficiales',
  })
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListScrutinyQueryDto,
  ) {
    return this.scrutiny.overview(user, query);
  }

  @Get('participants')
  @Roles(...READ_ROLES)
  listParticipants(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListScrutinyParticipantsQueryDto,
  ) {
    return this.scrutiny.listParticipants(user, query);
  }

  @Post('commissions')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createCommission(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateScrutinyCommissionDto,
  ) {
    return this.scrutiny.createCommission(user, dto);
  }

  @Put('commissions/:id/requirements')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  configureRequirement(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: ConfigureScrutinyRequirementDto,
  ) {
    return this.scrutiny.configureRequirement(user, params.id, dto);
  }

  @Post('commissions/:id/events')
  @Roles(...FIELD_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  recordSessionEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: RecordScrutinySessionEventDto,
  ) {
    return this.scrutiny.recordSessionEvent(user, params.id, dto);
  }

  @Post('commissions/:id/coverage')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  createCoverage(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: CreateScrutinyCoverageDto,
  ) {
    return this.scrutiny.createCoverage(user, params.id, dto);
  }

  @Post('documents')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateScrutinyDocumentDto,
  ) {
    return this.scrutiny.createDocument(user, dto);
  }

  @Post('documents/:id/review')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  reviewDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: ReviewScrutinyDocumentDto,
  ) {
    return this.scrutiny.reviewDocument(user, params.id, dto);
  }

  @Post('documents/:id/custody-events')
  @Roles(...FIELD_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  recordCustodyEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: RecordScrutinyCustodyEventDto,
  ) {
    return this.scrutiny.recordCustodyEvent(user, params.id, dto);
  }

  @Post('discrepancies')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  createDiscrepancy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateScrutinyDiscrepancyDto,
  ) {
    return this.scrutiny.createDiscrepancy(user, dto);
  }

  @Post('discrepancies/:id/resolve')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  resolveDiscrepancy(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: ResolveScrutinyDiscrepancyDto,
  ) {
    return this.scrutiny.resolveDiscrepancy(user, params.id, dto);
  }

  @Post('actions')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  createAction(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateScrutinyActionDto,
  ) {
    return this.scrutiny.createAction(user, dto);
  }

  @Post('actions/:id/versions')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  addActionVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: AddScrutinyActionVersionDto,
  ) {
    return this.scrutiny.addActionVersion(user, params.id, dto);
  }

  @Post('actions/:id/approve')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  approveAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: ApproveScrutinyActionDto,
  ) {
    return this.scrutiny.approveAction(user, params.id, dto);
  }

  @Post('actions/:id/file')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  fileAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: FileScrutinyActionDto,
  ) {
    return this.scrutiny.fileAction(user, params.id, dto);
  }

  @Post('actions/:id/decisions')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  recordDecision(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: RecordScrutinyDecisionDto,
  ) {
    return this.scrutiny.recordDecision(user, params.id, dto);
  }

  @Post('decisions/:id/review')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  reviewDecision(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: ReviewScrutinyDecisionDto,
  ) {
    return this.scrutiny.reviewDecision(user, params.id, dto);
  }

  @Post('declarations')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  createDeclaration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateScrutinyDeclarationDto,
  ) {
    return this.scrutiny.createDeclaration(user, dto);
  }

  @Post('declarations/:id/review')
  @Roles(...LEGAL_ROLES)
  @RequireOperationStages(...SCRUTINY_STAGES)
  reviewDeclaration(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ScrutinyResourceParamsDto,
    @Body() dto: ReviewScrutinyDeclarationDto,
  ) {
    return this.scrutiny.reviewDeclaration(user, params.id, dto);
  }
}
