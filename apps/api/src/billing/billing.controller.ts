import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { BillingService } from './billing.service';

// In a real app we would import JwtAuthGuard. For now we assume req.user.tenantId exists.

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  async getPlans() {
    return this.billingService.listPlans();
  }

  @Get('subscription')
  async getSubscription(@Request() req: any) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new Error('No tenantId found in request');
    }
    return this.billingService.getCurrentSubscription(tenantId);
  }

  @Get('usage')
  async getUsage(@Request() req: any) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new Error('No tenantId found in request');
    }
    return this.billingService.getUsage(tenantId);
  }
}
