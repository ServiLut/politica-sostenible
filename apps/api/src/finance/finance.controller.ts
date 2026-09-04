import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateFinancialEntryDto } from './dto/create-financial-entry.dto';
import { Role } from '../../prisma/generated/prisma';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpsertFinanceSettingsDto } from './dto/upsert-finance-settings.dto';
import { ReviewFinancialEntryDto } from './dto/review-financial-entry.dto';
import { MarkCneReportedDto } from './dto/mark-cne-reported.dto';

const FINANCE_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
];
const FINANCE_READ_ROLES = [
  ...FINANCE_WRITE_ROLES,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
const FINANCE_REVIEW_ROLES = [
  Role.ADMIN,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
];

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post()
  @Roles(...FINANCE_WRITE_ROLES)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFinancialEntryDto,
  ) {
    return this.financeService.create(user.tenantId, user.userId, dto);
  }

  @Get()
  @Roles(...FINANCE_READ_ROLES)
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.findAll(user.tenantId, user.userId);
  }

  @Get('summary')
  @Roles(...FINANCE_READ_ROLES)
  async getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.getSummary(user.tenantId);
  }

  @Put('settings')
  @Roles(...FINANCE_WRITE_ROLES)
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertFinanceSettingsDto,
  ) {
    return this.financeService.updateSettings(user.tenantId, user.userId, dto);
  }

  @Patch(':id/review')
  @Roles(...FINANCE_REVIEW_ROLES)
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') entryId: string,
    @Body() dto: ReviewFinancialEntryDto,
  ) {
    return this.financeService.review(user.tenantId, user.userId, entryId, dto);
  }

  @Patch(':id/cne-report')
  @Roles(...FINANCE_REVIEW_ROLES)
  @ApiOperation({
    summary: 'Confirma una radicación realizada externamente en Cuentas Claras',
  })
  markReportedToCne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') entryId: string,
    @Body() dto: MarkCneReportedDto,
  ) {
    return this.financeService.markReportedToCne(
      user.tenantId,
      user.userId,
      entryId,
      dto,
    );
  }

  @Get('cne-review-draft')
  @Roles(...FINANCE_READ_ROLES)
  @ApiOperation({
    summary: 'Descarga borrador interno para revisión CNE',
    operationId: 'downloadCneReviewDraft',
  })
  async getCneReport(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const csv = await this.financeService.generateCneReport(
      user.tenantId,
      user.userId,
    );
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      'attachment; filename=borrador-interno-revision-cne.csv',
    );
    res.header('Cache-Control', 'private, no-store');
    res.header('X-Content-Type-Options', 'nosniff');
    return res.send(csv);
  }
}
