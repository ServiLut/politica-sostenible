import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
  Res,
} from '@nestjs/common';
import { FinanceService, CreateFinanceDto } from './finance.service';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';

@ApiTags('Finance')
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post()
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-user-id', required: true })
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateFinanceDto,
  ) {
    if (!tenantId || !userId) throw new UnauthorizedException();
    return this.financeService.create(tenantId, userId, dto);
  }

  @Get()
  @ApiHeader({ name: 'x-tenant-id', required: true })
  async findAll(@Headers('x-tenant-id') tenantId: string) {
    return this.financeService.findAll(tenantId);
  }

  @Get('summary')
  @ApiHeader({ name: 'x-tenant-id', required: true })
  async getSummary(@Headers('x-tenant-id') tenantId: string) {
    return this.financeService.getSummary(tenantId);
  }

  @Post('validate')
  async validateExpense(@Body() data: Partial<CreateFinanceDto>) {
    return this.financeService.validateExpense(data);
  }

  @Get('cne-report')
  @ApiHeader({ name: 'x-tenant-id', required: true })
  async getCneReport(
    @Headers('x-tenant-id') tenantId: string,
    @Res() res: any,
  ) {
    const csv = await this.financeService.generateCneReport(tenantId);
    res.header('Content-Type', 'text/csv');
    res.header(
      'Content-Disposition',
      `attachment; filename=cne_report_${tenantId}.csv`,
    );
    return res.send(csv);
  }
}
