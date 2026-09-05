import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SaasAdminService } from './saas-admin.service';
import { SaasAdminGuard } from '../auth/guards/saas-admin.guard';

@Controller('saas-admin')
@UseGuards(SaasAdminGuard)
export class SaasAdminController {
  constructor(private readonly saasAdminService: SaasAdminService) {}

  @Get('stats')
  async getPlatformStats() {
    return this.saasAdminService.getPlatformStats();
  }

  @Get('tenants')
  async listTenants() {
    return this.saasAdminService.listTenants();
  }

  @Get('tenants/:id')
  async getTenantDetail(@Param('id') id: string) {
    return this.saasAdminService.getTenantDetail(id);
  }
}
