import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SaasAdminService } from './saas-admin.service';
import { SaasAdminGuard } from '../auth/guards/saas-admin.guard';
import { CuidIdParamsDto } from '../common/dto/cuid-id-params.dto';
import { AllowAnyAuthenticatedRole } from '../auth/decorators/allow-any-authenticated.decorator';
import { ListSaasAdminQueryDto } from './dto/list-saas-admin-query.dto';

@Controller('saas-admin')
@UseGuards(SaasAdminGuard)
@AllowAnyAuthenticatedRole()
export class SaasAdminController {
  constructor(private readonly saasAdminService: SaasAdminService) {}

  @Get('stats')
  async getPlatformStats() {
    return this.saasAdminService.getPlatformStats();
  }

  @Get('tenants')
  async listTenants(@Query() query: ListSaasAdminQueryDto) {
    return this.saasAdminService.listTenants(query);
  }

  @Get('tenants/:id')
  async getTenantDetail(
    @Param() params: CuidIdParamsDto,
    @Query() query: ListSaasAdminQueryDto,
  ) {
    return this.saasAdminService.getTenantDetail(params.id, query);
  }
}
