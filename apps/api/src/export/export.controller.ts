import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { once } from 'node:events';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PlanFeature,
  RequiresPlanFeature,
} from '../auth/decorators/requires-plan-feature.decorator';
import { ExportModuleParamsDto } from './dto/export-module-params.dto';
import { ExportService } from './export.service';

@ApiTags('Export')
@ApiBearerAuth()
@Controller('export')
@RequiresPlanFeature(PlanFeature.EXPORT)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get(':module')
  @Roles(
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  )
  async exportModule(
    @Param() params: ExportModuleParamsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const abortController = new AbortController();
    const abortOnRequestClose = () => abortController.abort();
    const abortOnResponseClose = () => {
      if (!res.writableEnded) abortController.abort();
    };

    req.once('aborted', abortOnRequestClose);
    res.once('close', abortOnResponseClose);

    try {
      const opened = await this.exportService.openExport(
        params.module,
        user,
        abortController.signal,
      );

      res.header('Content-Type', 'text/csv; charset=utf-8');
      res.header(
        'Content-Disposition',
        `attachment; filename="${opened.fileName}"`,
      );
      res.header('Cache-Control', 'private, no-store');
      res.header('X-Content-Type-Options', 'nosniff');

      for await (const chunk of opened.chunks) {
        abortController.signal.throwIfAborted();
        if (!res.write(chunk)) {
          await once(res, 'drain', { signal: abortController.signal });
        }
      }

      if (!res.writableEnded) res.end();
    } catch (error) {
      if (abortController.signal.aborted) return;
      if (!res.headersSent) throw error;
      res.destroy(error instanceof Error ? error : undefined);
    } finally {
      req.off('aborted', abortOnRequestClose);
      res.off('close', abortOnResponseClose);
    }
  }
}
