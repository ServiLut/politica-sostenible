import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const EXPORT_MODULES = [
  'personas',
  'tareas',
  'casos',
  'compromisos',
  'eventos',
  'equipo',
] as const;

export type ExportModule = (typeof EXPORT_MODULES)[number];

export class ExportModuleParamsDto {
  @ApiProperty({ enum: EXPORT_MODULES })
  @IsString()
  @IsIn(EXPORT_MODULES, {
    message: 'El modulo solicitado no admite exportacion',
  })
  module: ExportModule;
}
