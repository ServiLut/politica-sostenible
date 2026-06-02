import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateVoterDto {
  @IsString()
  @IsOptional()
  documentId?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  puestoId?: string;

  @IsInt()
  @IsOptional()
  mesa?: number;

  @IsBoolean()
  @IsOptional()
  isSignatureValid?: boolean;

  @IsObject()
  @IsOptional()
  psychographicData?: Record<string, unknown>;
}
