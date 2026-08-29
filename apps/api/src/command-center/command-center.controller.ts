import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CommandCenterService } from './command-center.service';

export const COMMAND_CENTER_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

@ApiTags('Command center')
@ApiBearerAuth()
@Roles(...COMMAND_CENTER_ROLES)
@Controller('command-center')
export class CommandCenterController {
  constructor(private readonly commandCenterService: CommandCenterService) {}

  @Get('briefing')
  @ApiOperation({
    summary:
      'Consolida activación, métricas y alertas del tenant y modo autenticados',
  })
  getBriefing(@CurrentUser() user: AuthenticatedUser) {
    return this.commandCenterService.getBriefing(user);
  }
}
