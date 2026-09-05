import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ListOperationalInboxQueryDto } from './dto/list-operational-inbox-query.dto';
import { OperationalInboxService } from './operational-inbox.service';

export const OPERATIONAL_INBOX_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMMUNICATIONS_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
] as const;

@ApiTags('Operational inbox')
@ApiBearerAuth()
@Roles(...OPERATIONAL_INBOX_ROLES)
@Controller('operational-inbox')
export class OperationalInboxController {
  constructor(
    private readonly operationalInboxService: OperationalInboxService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Consolida el trabajo abierto del tenant y modo autenticados en una sola bandeja',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOperationalInboxQueryDto,
  ) {
    return this.operationalInboxService.findAll(user, query);
  }
}
