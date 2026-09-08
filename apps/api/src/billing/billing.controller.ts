import { Controller, Get } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  async getPlans() {
    return this.billingService.listPlans();
  }

  @Get('subscription')
  @Roles(Role.ADMIN)
  async getSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getCurrentSubscription(user.tenantId);
  }

  @Get('usage')
  @Roles(Role.ADMIN)
  async getUsage(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getUsage(user.tenantId);
  }
}
