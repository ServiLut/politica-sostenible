import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  AttachPqrsdDocumentDto,
  AuthorizePqrsdResponseDto,
  ClosePqrsdDossierDto,
  CreatePqrsdDossierDto,
  CreatePqrsdResponseVersionDto,
  CreatePqrsdRulePackageDto,
  ListPqrsdQueryDto,
  PqrsdDetailQueryDto,
  PqrsdResourceParamsDto,
  ProposePqrsdClassificationDto,
  ProposePqrsdExtensionDto,
  ProposePqrsdTransferDto,
  RecordPqrsdAcknowledgementDto,
  RecordPqrsdAssignmentDto,
  RecordPqrsdDeliveryAttemptDto,
  RecordPqrsdTransferAttemptDto,
  ReopenPqrsdDossierDto,
  ReviewPqrsdClassificationDto,
  ReviewPqrsdDocumentDto,
  ReviewPqrsdExtensionDto,
  ReviewPqrsdResponseDto,
  ReviewPqrsdRulePackageDto,
  ReviewPqrsdTransferDto,
} from './dto/pqrsd.dto';
import { PQRSD_READ_ROLES } from './pqrsd-access.constants';
import { PqrsdService } from './pqrsd.service';

const INTAKE_ROLES = [
  Role.ADMIN,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
] as const;
const REVIEW_ROLES = [
  Role.ADMIN,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.COMPLIANCE_OFFICER,
] as const;
const AUTHORIZATION_ROLES = [Role.ADMIN, Role.COMPLIANCE_OFFICER] as const;

@ApiTags('Public-office PQRSD')
@ApiBearerAuth()
@Controller('pqrsd')
export class PqrsdController {
  constructor(private readonly pqrsd: PqrsdService) {}

  @Get()
  @Roles(...PQRSD_READ_ROLES)
  @ApiOperation({
    summary: 'Lista PQRSD enmascarada con configuracion, plazos y alertas',
  })
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPqrsdQueryDto,
  ) {
    return this.pqrsd.overview(user, query);
  }

  @Get('dossiers/:id')
  @Roles(...PQRSD_READ_ROLES)
  @ApiOperation({
    summary: 'Abre detalle sensible y registra el proposito de acceso',
  })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Query() query: PqrsdDetailQueryDto,
  ) {
    return this.pqrsd.detail(user, params.id, query.purpose);
  }

  @Post('rule-packages')
  @Roles(...REVIEW_ROLES)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createRulePackage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePqrsdRulePackageDto,
  ) {
    return this.pqrsd.createRulePackage(user, dto);
  }

  @Post('rule-packages/:id/review')
  @Roles(...AUTHORIZATION_ROLES)
  reviewRulePackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ReviewPqrsdRulePackageDto,
  ) {
    return this.pqrsd.reviewRulePackage(user, params.id, dto);
  }

  @Post('dossiers')
  @Roles(...INTAKE_ROLES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createDossier(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePqrsdDossierDto,
  ) {
    return this.pqrsd.createDossier(user, dto);
  }

  @Post('documents')
  @Roles(...INTAKE_ROLES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  attachDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AttachPqrsdDocumentDto,
  ) {
    return this.pqrsd.attachDocument(user, dto);
  }

  @Post('documents/:id/review')
  @Roles(...REVIEW_ROLES)
  reviewDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ReviewPqrsdDocumentDto,
  ) {
    return this.pqrsd.reviewDocument(user, params.id, dto);
  }

  @Post('dossiers/:id/acknowledgements')
  @Roles(...INTAKE_ROLES)
  recordAcknowledgement(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: RecordPqrsdAcknowledgementDto,
  ) {
    return this.pqrsd.recordAcknowledgement(user, params.id, dto);
  }

  @Post('dossiers/:id/classifications')
  @Roles(...INTAKE_ROLES)
  proposeClassification(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ProposePqrsdClassificationDto,
  ) {
    return this.pqrsd.proposeClassification(user, params.id, dto);
  }

  @Post('classifications/:id/review')
  @Roles(...REVIEW_ROLES)
  reviewClassification(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ReviewPqrsdClassificationDto,
  ) {
    return this.pqrsd.reviewClassification(user, params.id, dto);
  }

  @Post('dossiers/:id/assignments')
  @Roles(...REVIEW_ROLES)
  recordAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: RecordPqrsdAssignmentDto,
  ) {
    return this.pqrsd.recordAssignment(user, params.id, dto);
  }

  @Post('dossiers/:id/transfers')
  @Roles(...INTAKE_ROLES)
  proposeTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ProposePqrsdTransferDto,
  ) {
    return this.pqrsd.proposeTransfer(user, params.id, dto);
  }

  @Post('transfers/:id/review')
  @Roles(...REVIEW_ROLES)
  reviewTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ReviewPqrsdTransferDto,
  ) {
    return this.pqrsd.reviewTransfer(user, params.id, dto);
  }

  @Post('transfers/:id/attempts')
  @Roles(...INTAKE_ROLES)
  recordTransferAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: RecordPqrsdTransferAttemptDto,
  ) {
    return this.pqrsd.recordTransferAttempt(user, params.id, dto);
  }

  @Post('dossiers/:id/extensions')
  @Roles(...INTAKE_ROLES)
  proposeExtension(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ProposePqrsdExtensionDto,
  ) {
    return this.pqrsd.proposeExtension(user, params.id, dto);
  }

  @Post('extensions/:id/review')
  @Roles(...AUTHORIZATION_ROLES)
  reviewExtension(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ReviewPqrsdExtensionDto,
  ) {
    return this.pqrsd.reviewExtension(user, params.id, dto);
  }

  @Post('dossiers/:id/responses')
  @Roles(...INTAKE_ROLES)
  createResponseVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: CreatePqrsdResponseVersionDto,
  ) {
    return this.pqrsd.createResponseVersion(user, params.id, dto);
  }

  @Post('responses/:id/review')
  @Roles(...REVIEW_ROLES)
  reviewResponse(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ReviewPqrsdResponseDto,
  ) {
    return this.pqrsd.reviewResponse(user, params.id, dto);
  }

  @Post('responses/:id/authorize')
  @Roles(...AUTHORIZATION_ROLES)
  authorizeResponse(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: AuthorizePqrsdResponseDto,
  ) {
    return this.pqrsd.authorizeResponse(user, params.id, dto);
  }

  @Post('responses/:id/delivery-attempts')
  @Roles(...INTAKE_ROLES)
  recordDeliveryAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: RecordPqrsdDeliveryAttemptDto,
  ) {
    return this.pqrsd.recordDeliveryAttempt(user, params.id, dto);
  }

  @Post('dossiers/:id/close')
  @Roles(...AUTHORIZATION_ROLES)
  closeDossier(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ClosePqrsdDossierDto,
  ) {
    return this.pqrsd.closeDossier(user, params.id, dto);
  }

  @Post('dossiers/:id/reopen')
  @Roles(...AUTHORIZATION_ROLES)
  reopenDossier(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PqrsdResourceParamsDto,
    @Body() dto: ReopenPqrsdDossierDto,
  ) {
    return this.pqrsd.reopenDossier(user, params.id, dto);
  }
}
