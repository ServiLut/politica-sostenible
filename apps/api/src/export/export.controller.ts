import { Controller, Get, Param, Res } from '@nestjs/common';
import { ExportService } from './export.service';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Export')
@ApiBearerAuth()
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get(':module')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER, Role.COMPLIANCE_OFFICER, Role.AUDITOR)
  async exportModule(
    @Param('module') moduleName: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const csvBuffer = await this.exportService.generateExport(moduleName, user);

    const date = new Date().toISOString().split('T')[0];
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      `attachment; filename="export-${moduleName}-${date}.csv"`,
    );
    res.header('Cache-Control', 'private, no-store');
    res.header('X-Content-Type-Options', 'nosniff');
    return res.send(csvBuffer);
  }
}
