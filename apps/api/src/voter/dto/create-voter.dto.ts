import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVoterDto {
  @ApiProperty({ example: '1012345678' })
  @IsString()
  @IsNotEmpty()
  documentId: string;

  @ApiProperty({ example: 'Carlos' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Restrepo' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '3001234567', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'carlos@email.com', required: false })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ description: 'ID del puesto de votación (DivisionPolitica)' })
  @IsString()
  @IsOptional()
  puestoId?: string;

  @ApiProperty({ example: 12, required: false })
  @IsInt()
  @IsOptional()
  mesa?: number;

  @ApiProperty({ example: true, description: '¿Ya firmó para el GSC?' })
  @IsBoolean()
  @IsOptional()
  isSignatureValid?: boolean;
}
