import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAuditLogDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  actor?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  action: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  module: string;

  @IsOptional()
  @IsString()
  @IsIn(['Info', 'Warning', 'Critical'])
  severity?: 'Info' | 'Warning' | 'Critical';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string | number | boolean | null>;
}
