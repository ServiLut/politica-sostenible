import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ImportService } from './import.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  ImportModuleParamDto,
  ImportPreviewDto,
} from './dto/import-preview.dto';
import {
  PlanFeature,
  RequiresPlanFeature,
} from '../auth/decorators/requires-plan-feature.decorator';
import { BlockWhenOperationClosed } from '../auth/decorators/operation-stage-policy.decorator';

@Controller('import')
@RequiresPlanFeature(PlanFeature.IMPORT)
@BlockWhenOperationClosed()
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post(':module/preview')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  async preview(
    @Param() params: ImportModuleParamDto,
    @Body() dto: ImportPreviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.importService.preview(params.module, dto.csv, user);
  }

  @Post(':module/execute')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  async execute(
    @Param() params: ImportModuleParamDto,
    @Body() dto: ImportPreviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.importService.execute(params.module, dto.csv, user);
  }

  @Get(':module/template')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  downloadTemplate(
    @Param() params: ImportModuleParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { module } = params;
    const template =
      `Documento,Nombre,Apellido,Teléfono,Correo,Puesto,Mesa,Consentimiento,Version aviso,Fecha consentimiento,Ruta evidencia\n` +
      `1234567890,Juan,García,3001234567,juan@ejemplo.com,,,SI,VERSION_AVISO_ACTIVA,2026-09-01T14:30:00.000Z,${user.tenantId}/consent/UUID.pdf`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="plantilla_${module}.csv"`,
    );
    res.send(Buffer.from('\uFEFF' + template, 'utf-8'));
  }
}
