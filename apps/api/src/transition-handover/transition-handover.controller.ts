import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { TransitionHandoverService } from './transition-handover.service';

@Controller('transition-handover')
export class TransitionHandoverController {
  constructor(
    private readonly transitionHandoverService: TransitionHandoverService,
  ) {}

  @Get('report')
  @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER)
  async getHandoverReport(@CurrentUser() user: AuthenticatedUser) {
    return this.transitionHandoverService.generateHandoverReport(
      user.tenantId,
      user.userId,
    );
  }
}
