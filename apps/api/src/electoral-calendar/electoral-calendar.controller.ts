import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  ActivateElectoralCalendarReleaseDto,
  CreateElectoralCalendarReleaseDto,
  ElectoralCalendarResourceParamsDto,
  RecordElectoralCalendarResultDto,
  ReviewElectoralCalendarResultDto,
  ValidateElectoralCalendarReleaseDto,
} from './dto/electoral-calendar.dto';
import { ElectoralCalendarService } from './electoral-calendar.service';

const READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;

@ApiTags('Versioned electoral calendar')
@ApiBearerAuth()
@Controller('electoral-calendar')
@Roles(...READ_ROLES)
export class ElectoralCalendarController {
  constructor(private readonly calendar: ElectoralCalendarService) {}

  @Get()
  @ApiOperation({
    summary:
      'Consulta versiones, diff, vencidos y proximos del control interno',
  })
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.calendar.getOverview(user);
  }

  @Post('releases')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Carga una version STAGED con todos sus hitos' })
  createRelease(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateElectoralCalendarReleaseDto,
  ) {
    return this.calendar.createRelease(user, dto);
  }

  @Post('releases/:id/validate')
  @Roles(Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @BlockWhenOperationClosed()
  @ApiOperation({ summary: 'Valida fuente y contenido mediante cuatro ojos' })
  validateRelease(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ElectoralCalendarResourceParamsDto,
    @Body() dto: ValidateElectoralCalendarReleaseDto,
  ) {
    return this.calendar.validateRelease(user, params.id, dto);
  }

  @Post('releases/:id/activate')
  @Roles(Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @BlockWhenOperationClosed()
  @ApiOperation({
    summary: 'Activa una version validada y sustituye la anterior',
  })
  activateRelease(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ElectoralCalendarResourceParamsDto,
    @Body() dto: ActivateElectoralCalendarReleaseDto,
  ) {
    return this.calendar.activateRelease(user, params.id, dto);
  }

  @Post('milestones/:id/results')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.FINANCE_MANAGER,
    Role.COMPLIANCE_OFFICER,
    Role.ZONE_COORDINATOR,
  )
  @BlockWhenOperationClosed()
  @ApiOperation({ summary: 'Registra un resultado operativo append-only' })
  recordResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ElectoralCalendarResourceParamsDto,
    @Body() dto: RecordElectoralCalendarResultDto,
  ) {
    return this.calendar.recordResult(user, params.id, dto);
  }

  @Post('results/:id/review')
  @Roles(Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @BlockWhenOperationClosed()
  @ApiOperation({ summary: 'Aplica segundo control a un resultado sensible' })
  reviewResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ElectoralCalendarResourceParamsDto,
    @Body() dto: ReviewElectoralCalendarResultDto,
  ) {
    return this.calendar.reviewResult(user, params.id, dto);
  }
}
