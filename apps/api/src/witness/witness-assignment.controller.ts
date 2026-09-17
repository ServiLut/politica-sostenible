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
  CancelWitnessAssignmentDto,
  ConfirmWitnessAssignmentDto,
  CreateWitnessCoverageWindowDto,
  CreateWitnessAssignmentDto,
  ListWitnessCoverageWindowsQueryDto,
  ListWitnessAssignmentsQueryDto,
  ReassignWitnessAssignmentDto,
  WitnessAssignmentIdParamsDto,
  WitnessCandidateQueryDto,
  WitnessCoverageQueryDto,
  UpdateWitnessCoverageWindowDto,
} from './dto/witness-assignment.dto';
import { WitnessAssignmentService } from './witness-assignment.service';

const READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;
const PLANNER_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
] as const;
const MUTATION_STAGES = [
  PoliticalOperationStage.PRE_CAMPAIGN,
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
] as const;

@ApiTags('Witness planning')
@ApiBearerAuth()
@BlockWhenOperationClosed()
@Controller('witnesses/assignments')
export class WitnessAssignmentController {
  constructor(private readonly assignments: WitnessAssignmentService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary:
      'Lista asignaciones tenant-scoped sin confiar en filtros de tenant',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWitnessAssignmentsQueryDto,
  ) {
    return this.assignments.list(user, query);
  }

  @Get('coverage-windows')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary: 'Lista las ventanas horarias explícitas por puesto y jornada',
  })
  coverageWindows(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWitnessCoverageWindowsQueryDto,
  ) {
    return this.assignments.listCoverageWindows(user, query);
  }

  @Post('coverage-windows')
  @Roles(...PLANNER_ROLES)
  @RequireOperationStages(...MUTATION_STAGES)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Declara la ventana operativa local de un puesto' })
  createCoverageWindow(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWitnessCoverageWindowDto,
  ) {
    return this.assignments.createCoverageWindow(user, dto);
  }

  @Put('coverage-windows/:id')
  @Roles(...PLANNER_ROLES)
  @RequireOperationStages(...MUTATION_STAGES)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Reprograma una ventana vacía con concurrencia optimista',
  })
  updateCoverageWindow(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: WitnessAssignmentIdParamsDto,
    @Body() dto: UpdateWitnessCoverageWindowDto,
  ) {
    return this.assignments.updateCoverageWindow(user, params.id, dto);
  }

  @Get('coverage')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary:
      'Calcula brechas exactas por mesa y tiempo para titulares y suplentes',
  })
  coverage(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WitnessCoverageQueryDto,
  ) {
    return this.assignments.coverage(user, query);
  }

  @Get('candidates')
  @Roles(...PLANNER_ROLES)
  @ApiOperation({ summary: 'Lista solo TESTIGOS activos que pueden asignarse' })
  candidates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WitnessCandidateQueryDto,
  ) {
    return this.assignments.listCandidates(user, query);
  }

  @Post()
  @Roles(...PLANNER_ROLES)
  @RequireOperationStages(...MUTATION_STAGES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Planifica un rango exacto de mesas y un turno' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWitnessAssignmentDto,
  ) {
    return this.assignments.create(user, dto);
  }

  @Post(':id/confirm')
  @Roles(...PLANNER_ROLES, Role.WITNESS)
  @RequireOperationStages(...MUTATION_STAGES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Confirma una asignacion con version e idempotencia explicitas',
  })
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: WitnessAssignmentIdParamsDto,
    @Body() dto: ConfirmWitnessAssignmentDto,
  ) {
    return this.assignments.confirm(user, params.id, dto);
  }

  @Post(':id/cancel')
  @Roles(...PLANNER_ROLES, Role.WITNESS)
  @RequireOperationStages(...MUTATION_STAGES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cancela preservando la historia de la asignacion' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: WitnessAssignmentIdParamsDto,
    @Body() dto: CancelWitnessAssignmentDto,
  ) {
    return this.assignments.cancel(user, params.id, dto);
  }

  @Post(':id/reassign')
  @Roles(...PLANNER_ROLES)
  @RequireOperationStages(...MUTATION_STAGES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Cancela la asignacion vigente y crea el reemplazo en una transaccion',
  })
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: WitnessAssignmentIdParamsDto,
    @Body() dto: ReassignWitnessAssignmentDto,
  ) {
    return this.assignments.reassign(user, params.id, dto);
  }
}
