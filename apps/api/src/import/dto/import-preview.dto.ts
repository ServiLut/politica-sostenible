import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImportPreviewDto {
  @ApiProperty({ description: 'Contenido del archivo CSV' })
  @IsString()
  @IsNotEmpty({ message: 'El CSV no puede estar vacío' })
  csv: string;
}
