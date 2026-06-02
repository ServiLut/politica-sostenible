import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Headers,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  FinanceService,
  CreateFinanceDto,
  UpdateFinanceDto,
} from './finance.service';
import { ApiTags, ApiHeader } from '@nestjs/swagger';
import { JwtIdentityService } from '../common/services/jwt-identity.service';
import { CneLimitGuard } from './guards/cne-limit.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';

@ApiTags('Finance')
@Controller('finance')
@UseGuards(RolesGuard)
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly jwtIdentityService: JwtIdentityService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  @UseGuards(CneLimitGuard)
  @ApiHeader({ name: 'authorization', required: true })
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateFinanceDto,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.financeService.create(identity.tenantId, identity.userId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  @ApiHeader({ name: 'authorization', required: true })
  async findAll(@Headers('authorization') authorization: string | undefined) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.financeService.findAll(identity.tenantId);
  }

  @Get('summary')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.ZONE_COORDINATOR)
  @ApiHeader({ name: 'authorization', required: true })
  async getSummary(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.financeService.getSummary(identity.tenantId);
  }

  @Post('validate')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  @ApiHeader({ name: 'authorization', required: true })
  async validateExpense(
    @Headers('authorization') authorization: string | undefined,
    @Body() data: Partial<CreateFinanceDto>,
  ) {
    await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.financeService.validateExpense(data);
  }

  @Get('cne-report')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  @ApiHeader({ name: 'authorization', required: true })
  async getCneReport(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: any,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    const tenantId = identity.tenantId;
    const csv = await this.financeService.generateCneReport(tenantId);
    res.header('Content-Type', 'text/csv');
    res.header(
      'Content-Disposition',
      `attachment; filename=cne_report_${tenantId}.csv`,
    );
    return res.send(csv);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  @ApiHeader({ name: 'authorization', required: true })
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceDto,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.financeService.update(identity.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  @ApiHeader({ name: 'authorization', required: true })
  async remove(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);
    return this.financeService.remove(identity.tenantId, id);
  }
}
