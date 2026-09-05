import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ElectionDayService } from './election-day.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@ApiTags('Election Day')
@ApiBearerAuth()
@Controller('election-day')
export class ElectionDayController {
  constructor(private readonly electionDayService: ElectionDayService) {}

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.COMPLIANCE_OFFICER)
  async getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.electionDayService.getElectionDayDashboard(user.tenantId);
  }

  @Get('tally')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  async getVoteTally(@CurrentUser() user: AuthenticatedUser) {
    return this.electionDayService.getVoteTally(user.tenantId);
  }

  @Get('alerts')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.COMPLIANCE_OFFICER)
  async getAlerts(@CurrentUser() user: AuthenticatedUser) {
    return this.electionDayService.getAlerts(user.tenantId);
  }
}
