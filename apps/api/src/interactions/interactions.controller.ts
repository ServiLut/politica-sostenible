import { Body, Controller, Get, Ip, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CaseConsentQueryDto } from './dto/case-consent-query.dto';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { GrantCaseConsentDto } from './dto/grant-case-consent.dto';
import { ListInteractionsQueryDto } from './dto/list-interactions-query.dto';
import { RevokeCaseConsentDto } from './dto/revoke-case-consent.dto';
import { InteractionsService } from './interactions.service';

const INTERACTION_READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.ZONE_COORDINATOR,
  Role.AUDITOR,
  Role.COMPLIANCE_OFFICER,
] as const;

const INTERACTION_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.ZONE_COORDINATOR,
] as const;

const CASE_CONSENT_READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.AUDITOR,
  Role.COMPLIANCE_OFFICER,
] as const;

const CASE_CONSENT_GRANT_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
] as const;

const CASE_CONSENT_REVOKE_ROLES = [
  ...CASE_CONSENT_GRANT_ROLES,
  Role.COMPLIANCE_OFFICER,
] as const;

@ApiTags('Interactions')
@ApiBearerAuth()
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Get('consents/status')
  @Roles(...CASE_CONSENT_READ_ROLES)
  @ApiOperation({
    summary: 'Consulta el consentimiento vigente derivado de un caso',
  })
  getCaseConsentStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CaseConsentQueryDto,
  ) {
    return this.interactionsService.getCaseConsentStatus(
      user,
      query.issueCaseId,
    );
  }

  @Post('consents/grants')
  @Roles(...CASE_CONSENT_GRANT_ROLES)
  @ApiOperation({
    summary: 'Captura una autorizacion append-only para seguimiento del caso',
  })
  grantCaseConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Ip() sourceIp: string,
    @Body() dto: GrantCaseConsentDto,
  ) {
    return this.interactionsService.grantCaseConsent(user, sourceIp, dto);
  }

  @Post('consents/revocations')
  @Roles(...CASE_CONSENT_REVOKE_ROLES)
  @ApiOperation({
    summary: 'Revoca una autorizacion de seguimiento sin borrar historial',
  })
  revokeCaseConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Ip() sourceIp: string,
    @Body() dto: RevokeCaseConsentDto,
  ) {
    return this.interactionsService.revokeCaseConsent(user, sourceIp, dto);
  }

  @Get()
  @Roles(...INTERACTION_READ_ROLES)
  @ApiOperation({
    summary: 'Consulta la bitacora append-only de un caso o ciudadano',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListInteractionsQueryDto,
  ) {
    return this.interactionsService.findAll(user, query);
  }

  @Post()
  @Roles(...INTERACTION_WRITE_ROLES)
  @ApiOperation({
    summary: 'Registra una interaccion auditable en el tenant y modo activos',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInteractionDto,
  ) {
    return this.interactionsService.create(user, dto);
  }
}
