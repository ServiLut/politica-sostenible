import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  AdvanceSignatureBatchDto,
  CreateSignatureBatchDto,
  CreateSignatureCollectionPlanDto,
  IssueSignatureBatchDto,
  QuarantineSignatureBatchDto,
  RecordSignatureAuthorityResultDto,
  ReleaseSignatureBatchDto,
  ReturnSignatureBatchDto,
  ReviewSignatureAuthorityResultDto,
  ReviewSignatureBatchDto,
  SignatureResourceParamsDto,
} from './dto/signature-collection.dto';
import { SignatureCollectionService } from './signature-collection.service';

const READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

@ApiTags('Citizen-support signature collection')
@ApiBearerAuth()
@Controller('signature-collection')
@Roles(...READ_ROLES)
export class SignatureCollectionController {
  constructor(private readonly signatures: SignatureCollectionService) {}

  @Get()
  @ApiOperation({
    summary:
      'Consulta el expediente agregado sin identidad de quienes brindan apoyo',
  })
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.signatures.getOverview(user);
  }

  @Post('plans')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Crea el expediente minimo de recoleccion' })
  createPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSignatureCollectionPlanDto,
  ) {
    return this.signatures.createPlan(user, dto);
  }

  @Post('batches')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Planifica un lote fisico agregado' })
  createBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSignatureBatchDto,
  ) {
    return this.signatures.createBatch(user, dto);
  }

  @Post('batches/:id/issue')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  @BlockWhenOperationClosed()
  issueBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SignatureResourceParamsDto,
    @Body() dto: IssueSignatureBatchDto,
  ) {
    return this.signatures.issueBatch(user, params.id, dto);
  }

  @Post('batches/:id/return')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  @BlockWhenOperationClosed()
  returnBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SignatureResourceParamsDto,
    @Body() dto: ReturnSignatureBatchDto,
  ) {
    return this.signatures.returnBatch(user, params.id, dto);
  }

  @Post('batches/:id/internal-review')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.COMPLIANCE_OFFICER)
  @BlockWhenOperationClosed()
  reviewBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SignatureResourceParamsDto,
    @Body() dto: ReviewSignatureBatchDto,
  ) {
    return this.signatures.reviewBatch(user, params.id, dto);
  }

  @Post('batches/:id/advance')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  @BlockWhenOperationClosed()
  advanceBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SignatureResourceParamsDto,
    @Body() dto: AdvanceSignatureBatchDto,
  ) {
    return this.signatures.advanceBatch(user, params.id, dto);
  }

  @Post('batches/:id/quarantine')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  @BlockWhenOperationClosed()
  quarantineBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SignatureResourceParamsDto,
    @Body() dto: QuarantineSignatureBatchDto,
  ) {
    return this.signatures.quarantineBatch(user, params.id, dto);
  }

  @Post('batches/:id/release-quarantine')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.COMPLIANCE_OFFICER)
  @BlockWhenOperationClosed()
  releaseBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SignatureResourceParamsDto,
    @Body() dto: ReleaseSignatureBatchDto,
  ) {
    return this.signatures.releaseBatch(user, params.id, dto);
  }

  @Post('authority-results')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  recordAuthorityResult(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordSignatureAuthorityResultDto,
  ) {
    return this.signatures.recordAuthorityResult(user, dto);
  }

  @Post('authority-results/:id/review')
  @Roles(Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  reviewAuthorityResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SignatureResourceParamsDto,
    @Body() dto: ReviewSignatureAuthorityResultDto,
  ) {
    return this.signatures.reviewAuthorityResult(user, params.id, dto);
  }
}
