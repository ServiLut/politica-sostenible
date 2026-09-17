import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  PlanFeature,
  RequiresPlanFeature,
} from '../auth/decorators/requires-plan-feature.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import { ElectronicSignatureService } from './electronic-signature.service';
import {
  SignatureParamsDto,
  SignatureModuleQueryDto,
  SignDocumentDto,
  VerifySignatureQueryDto,
} from './dto/electronic-signature.dto';

const SIGNATURE_SIGN_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];

const SIGNATURE_VERIFY_ROLES = [
  ...SIGNATURE_SIGN_ROLES,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];

@ApiTags('Electronic signatures')
@ApiBearerAuth()
@BlockWhenOperationClosed()
@Controller('electronic-signature')
export class ElectronicSignatureController {
  constructor(private readonly signatureService: ElectronicSignatureService) {}

  @Get('candidates')
  @Roles(...SIGNATURE_SIGN_ROLES)
  @RequiresPlanFeature(PlanFeature.MFA)
  async listSigningCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SignatureModuleQueryDto,
  ) {
    return this.signatureService.listSigningCandidates(user, query);
  }

  @Post('sign')
  @Roles(...SIGNATURE_SIGN_ROLES)
  @RequiresPlanFeature(PlanFeature.MFA)
  @Throttle({
    default: { limit: 5, ttl: 60_000, blockDuration: 5 * 60_000 },
  })
  async signDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SignDocumentDto,
    @Ip() ip: string,
  ) {
    return this.signatureService.signDocument(user, dto, ip);
  }

  @Get(':id/verify')
  @Roles(...SIGNATURE_VERIFY_ROLES)
  async verifySignature(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SignatureParamsDto,
    @Query() query: VerifySignatureQueryDto,
  ) {
    return this.signatureService.verifySignature(user, params.id, query);
  }
}
