import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImportPreviewDto {
  @ApiProperty({ description: 'Contenido del archivo CSV' })
  @IsString()
  @IsNotEmpty({ message: 'El CSV no puede estar vacío' })
  @MaxLength(100_000, { message: 'El CSV supera el tamaño permitido' })
  csv: string;
}

export class ImportModuleParamDto {
  @ApiProperty({ enum: ['personas'] })
  @IsString()
  @IsIn(['personas'])
  module: string;
}
