import { Controller, Post, Get, Param, Body, Res, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { ImportService } from './import.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/prisma';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ImportPreviewDto } from './dto/import-preview.dto';

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post(':module/preview')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  async preview(
    @Param('module') module: string,
    @Body('csv') csv: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!csv) {
      throw new BadRequestException('El campo csv es requerido');
    }
    return this.importService.preview(module, csv, user);
  }

  @Post(':module/execute')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  async execute(
    @Param('module') module: string,
    @Body('csv') csv: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!csv) {
      throw new BadRequestException('El campo csv es requerido');
    }
    return this.importService.execute(module, csv, user);
  }

  @Get(':module/template')
  @Roles(Role.ADMIN, Role.CAMPAIGN_MANAGER)
  async downloadTemplate(
    @Param('module') module: string,
    @Res() res: Response,
  ) {
    if (module !== 'personas') {
      throw new BadRequestException(`Módulo no soportado para importación: ${module}`);
    }
    const template = 'Documento,Nombre,Apellido,Teléfono,Correo,Puesto,Mesa\n1234567890,Juan,García,3001234567,juan@ejemplo.com,,';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="plantilla_${module}.csv"`);
    res.send(Buffer.from('\uFEFF' + template, 'utf-8'));
  }
}
