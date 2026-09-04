import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrganizationDto {
  @ApiProperty({ example: 'Campaña Alcaldía 2027', maxLength: 160 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la organización es requerido' })
  @MaxLength(160, {
    message: 'El nombre de la organización no puede superar 160 caracteres',
  })
  name: string;

  @ApiProperty({
    description:
      'Nombre que veía la persona al abrir el formulario; evita sobrescribir cambios concurrentes',
    example: 'Campaña Alcaldía 2027',
    maxLength: 160,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El nombre anterior de la organización es requerido' })
  @MaxLength(160, {
    message: 'El nombre anterior no puede superar 160 caracteres',
  })
  expectedName: string;
}
