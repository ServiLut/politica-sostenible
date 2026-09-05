import { Injectable, ForbiddenException } from '@nestjs/common';
import { BillingService } from '../../billing/billing.service';

@Injectable()
export class PlanLimitsService {
  constructor(private readonly billingService: BillingService) {}

  async checkLimit(tenantId: string, resource: 'users' | 'voters' | 'storage', increment = 1): Promise<void> {
    const isWithinLimits = await this.billingService.checkQuota(tenantId, resource, increment);
    
    if (!isWithinLimits) {
      throw new ForbiddenException(`Plan limit exceeded for resource: ${resource}`);
    }
  }
}
