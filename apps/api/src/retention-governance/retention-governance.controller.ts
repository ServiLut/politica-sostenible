import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AllowWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CancelRetentionDispositionDto,
  CreateRetentionDispositionDto,
  CreateRetentionLegalHoldDto,
  RetentionDispositionIdParamsDto,
  RetentionLegalHoldIdParamsDto,
  RetentionPreviewQueryDto,
  RevokeRetentionLegalHoldDto,
  ReviewRetentionDispositionDto,
} from './dto/retention-governance.dto';
import { RetentionGovernanceService } from './retention-governance.service';

const GOVERNANCE_ROLES = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

@ApiTags('Post-election retention governance')
@ApiBearerAuth()
@Controller('retention-governance')
@Roles(...GOVERNANCE_ROLES)
@AllowWhenOperationClosed()
export class RetentionGovernanceController {
  constructor(private readonly governance: RetentionGovernanceService) {}

  @Get()
  @ApiOperation({
    summary:
      'Consulta solicitudes y retenciones legales sin ejecutar disposicion',
  })
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.governance.getOverview(user);
  }

  @Get('preview')
  @ApiOperation({
    summary: 'Cuenta vencimientos y bloqueos sin leer ni mutar contenido',
  })
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RetentionPreviewQueryDto,
  ) {
    return this.governance.preview(user, query.scope, query.cutoffAt);
  }

  @Post('dispositions')
  @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Crea una solicitud durable; nunca elimina ni programa eliminaciones',
  })
  requestDisposition(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRetentionDispositionDto,
  ) {
    return this.governance.requestDisposition(user, dto);
  }

  @Post('dispositions/:id/review')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Aprueba como no ejecutada o rechaza mediante cuatro ojos',
  })
  reviewDisposition(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: RetentionDispositionIdParamsDto,
    @Body() dto: ReviewRetentionDispositionDto,
  ) {
    return this.governance.reviewDisposition(user, params.id, dto);
  }

  @Post('dispositions/:id/cancel')
  @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Cancela la solicitud propia mientras esta pendiente',
  })
  cancelDisposition(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: RetentionDispositionIdParamsDto,
    @Body() dto: CancelRetentionDispositionDto,
  ) {
    return this.governance.cancelDisposition(user, params.id, dto);
  }

  @Post('legal-holds')
  @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registra una orden de conservacion append-only' })
  createLegalHold(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRetentionLegalHoldDto,
  ) {
    return this.governance.createLegalHold(user, dto);
  }

  @Post('legal-holds/:id/revoke')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Revoca una orden con otro actor y un recibo append-only',
  })
  revokeLegalHold(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: RetentionLegalHoldIdParamsDto,
    @Body() dto: RevokeRetentionLegalHoldDto,
  ) {
    return this.governance.revokeLegalHold(user, params.id, dto);
  }
}
