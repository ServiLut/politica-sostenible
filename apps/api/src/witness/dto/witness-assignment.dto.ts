import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  WitnessAssignmentStatus,
  WitnessAssignmentType,
  WitnessCaptureContext,
} from '../../../prisma/generated/prisma';
import { PRISMA_CUID_PATTERN } from '../../common/dto/cuid-id-params.dto';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrim = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized || undefined;
};

const toOptionalInt = ({ value }: TransformFnParams): unknown =>
  value === '' || value === undefined ? undefined : Number(value);

export class WitnessAssignmentIdParamsDto {
  @Transform(trim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  id: string;
}

export class CreateWitnessAssignmentDto {
  @Transform(trim)
  @IsUUID('4')
  clientRequestId: string;

  @Transform(trim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  coverageWindowId: string;

  @Transform(trim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  witnessId: string;

  @Transform(trim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  puestoId: string;

  @IsInt()
  @Min(1)
  @Max(99_999)
  tableStart: number;

  @IsInt()
  @Min(1)
  @Max(99_999)
  tableEnd: number;

  @Transform(trim)
  @IsISO8601({ strict: true })
  shiftStartsAt: string;

  @Transform(trim)
  @IsISO8601({ strict: true })
  shiftEndsAt: string;

  @IsIn([WitnessCaptureContext.REAL, WitnessCaptureContext.SIMULATION])
  captureContext: WitnessCaptureContext;

  @IsEnum(WitnessAssignmentType)
  assignmentType: WitnessAssignmentType;
}

export class CreateWitnessCoverageWindowDto {
  @Transform(trim)
  @IsUUID('4')
  clientRequestId: string;

  @Transform(trim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  puestoId: string;

  @IsIn([WitnessCaptureContext.REAL, WitnessCaptureContext.SIMULATION])
  captureContext: WitnessCaptureContext;

  @Transform(trim)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  localDate: string;

  @Transform(trim)
  @IsISO8601({ strict: true })
  startsAt: string;

  @Transform(trim)
  @IsISO8601({ strict: true })
  endsAt: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9._+-]*(\/[A-Za-z][A-Za-z0-9._+-]*)+$/)
  @MaxLength(64)
  timeZone: string;

  @IsInt()
  @Min(-840)
  @Max(840)
  utcOffsetMinutes: number;
}

export class UpdateWitnessCoverageWindowDto {
  @Transform(trim)
  @IsUUID('4')
  clientRequestId: string;

  @IsInt()
  @Min(1)
  expectedVersion: number;

  @Transform(trim)
  @IsISO8601({ strict: true })
  startsAt: string;

  @Transform(trim)
  @IsISO8601({ strict: true })
  endsAt: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9._+-]*(\/[A-Za-z][A-Za-z0-9._+-]*)+$/)
  @MaxLength(64)
  timeZone: string;

  @IsInt()
  @Min(-840)
  @Max(840)
  utcOffsetMinutes: number;
}

export class ListWitnessCoverageWindowsQueryDto {
  @IsOptional()
  @IsIn([WitnessCaptureContext.REAL, WitnessCaptureContext.SIMULATION])
  captureContext: WitnessCaptureContext = WitnessCaptureContext.REAL;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  puestoId?: string;
}

export class ListWitnessAssignmentsQueryDto {
  @IsOptional()
  @IsIn([WitnessCaptureContext.REAL, WitnessCaptureContext.SIMULATION])
  captureContext: WitnessCaptureContext = WitnessCaptureContext.REAL;

  @IsOptional()
  @IsEnum(WitnessAssignmentStatus)
  status?: WitnessAssignmentStatus;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  puestoId?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  witnessId?: string;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class WitnessCoverageQueryDto {
  @IsOptional()
  @IsIn([WitnessCaptureContext.REAL, WitnessCaptureContext.SIMULATION])
  captureContext: WitnessCaptureContext = WitnessCaptureContext.REAL;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  puestoId?: string;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class WitnessCandidateQueryDto {
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class ConfirmWitnessAssignmentDto {
  @Transform(trim)
  @IsUUID('4')
  clientRequestId: string;

  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class CancelWitnessAssignmentDto extends ConfirmWitnessAssignmentDto {
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason: string;
}

export class ReassignWitnessAssignmentDto extends CreateWitnessAssignmentDto {
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason: string;
}
