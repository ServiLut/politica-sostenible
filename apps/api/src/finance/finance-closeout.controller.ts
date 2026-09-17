import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  AllowWhenOperationClosed,
  BlockWhenOperationClosed,
} from '../auth/decorators/operation-stage-policy.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  ApproveFinanceReportVersionDto,
  CreateFinanceBankStatementDto,
  CreateFinanceDossierDto,
  CreateFinanceInKindDto,
  CreateFinancePayableDto,
  CreateFinanceReportVersionDto,
  FinanceCloseoutResourceParamsDto,
  RecordFinanceExternalEvidenceDto,
  ReviewFinanceExternalEvidenceDto,
  SettleFinancePayableDto,
} from './dto/finance-closeout.dto';
import { FinanceCloseoutService } from './finance-closeout.service';

const READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

@ApiTags('Finance closeout and Cuentas Claras preparation')
@ApiBearerAuth()
@Controller('finance/closeout')
@Roles(...READ_ROLES)
@AllowWhenOperationClosed()
export class FinanceCloseoutController {
  constructor(private readonly service: FinanceCloseoutService) {}

  @Get()
  @ApiOperation({
    summary:
      'Consulta cortes, conciliacion y evidencia interna sin afirmar radicacion oficial',
  })
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.service.overview(user);
  }

  @Post('dossiers')
  @Roles(Role.CAMPAIGN_MANAGER, Role.FINANCE_MANAGER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createDossier(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFinanceDossierDto,
  ) {
    return this.service.createDossier(user, dto);
  }

  @Post('bank-statements')
  @Roles(Role.FINANCE_MANAGER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createBankStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFinanceBankStatementDto,
  ) {
    return this.service.createBankStatement(user, dto);
  }

  @Post('in-kind-contributions')
  @Roles(Role.FINANCE_MANAGER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createInKind(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFinanceInKindDto,
  ) {
    return this.service.createInKind(user, dto);
  }

  @Post('payables')
  @Roles(Role.FINANCE_MANAGER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createPayable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFinancePayableDto,
  ) {
    return this.service.createPayable(user, dto);
  }

  @Post('payables/:id/settlements')
  @Roles(Role.FINANCE_MANAGER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  settlePayable(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: FinanceCloseoutResourceParamsDto,
    @Body() dto: SettleFinancePayableDto,
  ) {
    return this.service.settlePayable(user, params.id, dto);
  }

  @Post('dossiers/:id/versions')
  @Roles(Role.CAMPAIGN_MANAGER, Role.FINANCE_MANAGER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: FinanceCloseoutResourceParamsDto,
    @Body() dto: CreateFinanceReportVersionDto,
  ) {
    return this.service.createReportVersion(user, params.id, dto);
  }

  @Post('versions/:id/approvals')
  @Roles(Role.CAMPAIGN_MANAGER, Role.FINANCE_MANAGER, Role.COMPLIANCE_OFFICER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  approveVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: FinanceCloseoutResourceParamsDto,
    @Body() dto: ApproveFinanceReportVersionDto,
  ) {
    return this.service.approveReportVersion(user, params.id, dto);
  }

  @Post('versions/:id/external-evidence')
  @Roles(Role.FINANCE_MANAGER, Role.COMPLIANCE_OFFICER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  recordExternalEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: FinanceCloseoutResourceParamsDto,
    @Body() dto: RecordFinanceExternalEvidenceDto,
  ) {
    return this.service.recordExternalEvidence(user, params.id, dto);
  }

  @Post('external-evidence/:id/review')
  @Roles(Role.AUDITOR)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  reviewExternalEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: FinanceCloseoutResourceParamsDto,
    @Body() dto: ReviewFinanceExternalEvidenceDto,
  ) {
    return this.service.reviewExternalEvidence(user, params.id, dto);
  }
}
