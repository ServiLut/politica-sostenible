import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  DecideSignatureCountCorrectionDto,
  ProposeSignatureCountCorrectionDto,
  SignatureCountCorrectionProposalParamsDto,
} from './dto/signature-count-correction.dto';
import { SignatureResourceParamsDto } from './dto/signature-collection.dto';
import { SignatureCountCorrectionService } from './signature-count-correction.service';

const READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

@ApiTags('Signature batch count corrections')
@ApiBearerAuth()
@Controller('signature-collection')
@Roles(...READ_ROLES)
export class SignatureCountCorrectionController {
  constructor(private readonly corrections: SignatureCountCorrectionService) {}

  @Get('count-corrections')
  @ApiOperation({
    summary:
      'Consulta propuestas y decisiones compensatorias sin datos de apoyantes',
  })
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.corrections.getOverview(user);
  }

  @Post('batches/:id/count-corrections')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Propone valores absolutos sobre una fotografia completa de un lote en cuarentena',
  })
  propose(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SignatureResourceParamsDto,
    @Body() dto: ProposeSignatureCountCorrectionDto,
  ) {
    return this.corrections.propose(user, params.id, dto);
  }

  @Post('count-corrections/:id/decision')
  @Roles(Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  @BlockWhenOperationClosed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Registra una decision terminal independiente y aplica solo la aprobacion',
  })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: SignatureCountCorrectionProposalParamsDto,
    @Body() dto: DecideSignatureCountCorrectionDto,
  ) {
    return this.corrections.decide(user, params.id, dto);
  }
}
