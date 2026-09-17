import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { OperationReadinessResponseDto } from './dto/operation-readiness.dto';
import {
  CreateOperationStageAdoptionDto,
  OperationStageAdoptionIdParamsDto,
  ReviewOperationStageAdoptionDto,
} from './dto/operation-stage-adoption.dto';
import {
  CancelOperationTerminationDto,
  CreateOperationTerminationDto,
  OperationTerminationIdParamsDto,
  ReviewOperationTerminationDto,
} from './dto/operation-termination.dto';
import { UpsertOperationProfileDto } from './dto/upsert-operation-profile.dto';
import { OperationStageAdoptionService } from './operation-stage-adoption.service';
import { OperationTerminationService } from './operation-termination.service';
import { OPERATION_PROFILE_READ_ROLES } from './operation-readiness';
import { OperationProfileService } from './operation-profile.service';

@ApiTags('Political operation profile')
@ApiBearerAuth()
@Controller('operation-profile')
export class OperationProfileController {
  constructor(
    private readonly operationProfile: OperationProfileService,
    private readonly adoption: OperationStageAdoptionService,
    private readonly termination: OperationTerminationService,
  ) {}

  @Get('termination')
  @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Consulta el cierre excepcional y sus obligaciones',
  })
  getTerminationStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.termination.getStatus(user);
  }

  @Post('termination')
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Solicita terminar anticipadamente una operacion' })
  requestTermination(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOperationTerminationDto,
  ) {
    return this.termination.requestTermination(user, dto);
  }

  @Post('termination/:id/review')
  @Roles(Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Aprueba o rechaza un cierre excepcional' })
  reviewTermination(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: OperationTerminationIdParamsDto,
    @Body() dto: ReviewOperationTerminationDto,
  ) {
    return this.termination.reviewTermination(user, params.id, dto);
  }

  @Post('termination/:id/cancel')
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Cancela la solicitud propia mientras sigue pendiente',
  })
  cancelTermination(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: OperationTerminationIdParamsDto,
    @Body() dto: CancelOperationTerminationDto,
  ) {
    return this.termination.cancelTermination(user, params.id, dto);
  }

  @Get('adoption')
  @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @ApiOperation({ summary: 'Consulta el estado de adopcion excepcional' })
  getAdoptionStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.adoption.getStatus(user);
  }

  @Post('adoption')
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Solicita adoptar una operacion ya iniciada' })
  requestAdoption(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOperationStageAdoptionDto,
  ) {
    return this.adoption.requestAdoption(user, dto);
  }

  @Post('adoption/:id/review')
  @Roles(Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Aprueba o rechaza una adopcion pendiente' })
  reviewAdoption(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: OperationStageAdoptionIdParamsDto,
    @Body() dto: ReviewOperationStageAdoptionDto,
  ) {
    return this.adoption.reviewAdoption(user, params.id, dto);
  }

  @Get('readiness')
  @Roles(...OPERATION_PROFILE_READ_ROLES)
  @ApiOperation({
    summary:
      'Calcula el alistamiento verificable de la organizacion por etapa del ciclo',
  })
  @ApiOkResponse({ type: OperationReadinessResponseDto })
  getReadiness(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OperationReadinessResponseDto> {
    return this.operationProfile.getReadiness(user) as any;
  }

  @Get()
  @Roles(...OPERATION_PROFILE_READ_ROLES)
  @ApiOperation({
    summary: 'Consulta la configuracion de la organizacion autenticada',
  })
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.operationProfile.getCurrent(user);
  }

  @Put()
  @Roles(Role.ADMIN)
  @BlockWhenOperationClosed()
  @ApiOperation({
    summary:
      'Crea o actualiza de forma auditada la configuracion politica del tenant',
  })
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertOperationProfileDto,
  ) {
    return this.operationProfile.upsert(user, dto);
  }
}
