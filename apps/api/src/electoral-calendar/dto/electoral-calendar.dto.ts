import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  ElectoralCalendarMilestoneCategory,
  ElectoralCalendarMilestoneSemantics,
  ElectoralCalendarResultOutcome,
  ElectoralCalendarResultReviewDecision,
} from '../../../prisma/generated/prisma';
import { isIanaTimeZone } from '../electoral-calendar.time';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const STABLE_KEY = /^[A-Z0-9][A-Z0-9._-]{0,79}$/;
const ROUND_CODE = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const CIVIL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALERT_OFFSETS = [30, 15, 7, 3, 1, 0] as const;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;
const lowerTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const upperTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

@ValidatorConstraint({ name: 'durableCalendarHttps', async: false })
class DurableCalendarHttpsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length > 2_048) return false;
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password &&
        !/\s/u.test(value)
      );
    } catch {
      return false;
    }
  }
  defaultMessage() {
    return 'La fuente debe ser una URL HTTPS durable y sin credenciales';
  }
}

@ValidatorConstraint({ name: 'ianaCalendarTimeZone', async: false })
class IanaCalendarTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isIanaTimeZone(value);
  }
  defaultMessage() {
    return 'timeZone debe ser una zona IANA explicita, por ejemplo America/Bogota';
  }
}

export abstract class ElectoralCalendarCommandDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lowerTrim)
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  payloadSha256: string;
}

export class ElectoralCalendarResourceParamsDto {
  @Transform(lowerTrim)
  @IsUUID('4')
  id: string;
}

export class ElectoralCalendarMilestoneInputDto {
  @Transform(upperTrim)
  @Matches(STABLE_KEY)
  stableKey: string;

  @IsEnum(ElectoralCalendarMilestoneCategory)
  category: ElectoralCalendarMilestoneCategory;

  @IsEnum(ElectoralCalendarMilestoneSemantics)
  semantics: ElectoralCalendarMilestoneSemantics;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title: string;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(2_000)
  applicabilityRule: string;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(3_000)
  originalTextSummary: string;

  @Transform(trim)
  @IsDateString({ strict: true })
  localDate: string;

  @Transform(optionalTrim)
  @IsOptional()
  @Matches(CIVIL_TIME)
  localTime?: string;

  @Transform(trim)
  @Validate(IanaCalendarTimeZoneConstraint)
  timeZone: string;

  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  responsibleUserId?: string;

  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  backupUserId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsIn(ALERT_OFFSETS, { each: true })
  alertOffsetsDays: number[];

  @IsBoolean()
  stageGateRequired: boolean;

  @IsBoolean()
  resultEvidenceRequired: boolean;

  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  linkedTaskId?: string;

  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  linkedEventId?: string;
}

export class CreateElectoralCalendarReleaseDto extends ElectoralCalendarCommandDto {
  @Transform(optionalTrim)
  @IsOptional()
  @IsUUID('4')
  basedOnReleaseId?: string;

  @Transform(upperTrim)
  @Matches(ROUND_CODE)
  roundCode: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  versionLabel: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  sourceAuthority: string;

  @Transform(trim)
  @Validate(DurableCalendarHttpsConstraint)
  sourceUrl: string;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(1_000)
  sourceReference: string;

  @Transform(trim)
  @IsDateString({ strict: true })
  sourcePublishedAt: string;

  @Transform(trim)
  @IsDateString({ strict: true })
  sourceCutoffAt: string;

  @Transform(lowerTrim)
  @Matches(SHA256)
  sourceSha256: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => ElectoralCalendarMilestoneInputDto)
  milestones: ElectoralCalendarMilestoneInputDto[];
}

export class ValidateElectoralCalendarReleaseDto extends ElectoralCalendarCommandDto {
  @IsInt()
  @Type(() => Number)
  @Min(1)
  expectedVersion: number;

  @IsBoolean()
  sourceReviewedAcknowledged: boolean;

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2_000)
  rationale: string;
}

export class ActivateElectoralCalendarReleaseDto extends ElectoralCalendarCommandDto {
  @IsInt()
  @Type(() => Number)
  @Min(1)
  expectedVersion: number;

  @IsBoolean()
  sourceReviewedAcknowledged: boolean;

  @IsBoolean()
  diffReviewedAcknowledged: boolean;

  @IsBoolean()
  affectedTasksResolvedAcknowledged: boolean;

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2_000)
  rationale: string;
}

export class RecordElectoralCalendarResultDto extends ElectoralCalendarCommandDto {
  @IsEnum(ElectoralCalendarResultOutcome)
  outcome: ElectoralCalendarResultOutcome;

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(3_000)
  explanation: string;

  @ApiPropertyOptional({ description: 'Ruta opaca devuelta por Storage' })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MaxLength(512)
  evidenceStoragePath?: string;

  @ApiPropertyOptional({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @IsOptional()
  @Matches(SHA256)
  evidenceSha256?: string;
}

export class ReviewElectoralCalendarResultDto extends ElectoralCalendarCommandDto {
  @IsEnum(ElectoralCalendarResultReviewDecision)
  decision: ElectoralCalendarResultReviewDecision;

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2_000)
  rationale: string;
}
