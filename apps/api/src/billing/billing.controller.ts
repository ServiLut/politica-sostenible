import { Controller, Get } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Deliberately small, tenant-scoped product-entitlement snapshot. Every
   * authenticated role needs this to decide whether to present an action; the
   * backend feature guards remain the authority for the action itself.
   */
  @Get('capabilities')
  @Roles(...Object.values(Role))
  async getCapabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getCapabilities(user);
  }

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
