import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WorkPriority } from '../../../prisma/generated/prisma';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export enum OfflineIncidentCategory {
  SECURITY = 'SECURITY',
  LOGISTICS = 'LOGISTICS',
  ELECTORAL_MATERIAL = 'ELECTORAL_MATERIAL',
  ACCESSIBILITY = 'ACCESSIBILITY',
  PUBLIC_ORDER = 'PUBLIC_ORDER',
  TECHNOLOGY = 'TECHNOLOGY',
  COMPLIANCE = 'COMPLIANCE',
  OTHER = 'OTHER',
}

export class SyncOfflineIncidentDto {
  @Transform(trim)
  @IsUUID('4')
  clientOperationId: string;

  @Transform(trim)
  @IsISO8601({ strict: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/,
    { message: 'capturedAt debe incluir fecha, hora y zona horaria' },
  )
  capturedAt: string;

  @Transform(trim)
  @Matches(/^[a-f0-9]{64}$/)
  payloadSha256: string;

  @IsEnum(OfflineIncidentCategory)
  category: OfflineIncidentCategory;

  @IsEnum(WorkPriority)
  priority: WorkPriority;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  description: string;

  @Transform(trim)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  occurredOn: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  divisionId?: string;
}
