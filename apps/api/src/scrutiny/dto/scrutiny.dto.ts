import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMimeType,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  ScrutinyActionStatus,
  ScrutinyActionType,
  ScrutinyCommissionLevel,
  ScrutinyCoverageStatus,
  ScrutinyCustodyEventType,
  ScrutinyDeclarationReviewDecision,
  ScrutinyDecisionOutcome,
  ScrutinyDiscrepancySeverity,
  ScrutinyDiscrepancyStatus,
  ScrutinyDocumentReviewDecision,
  ScrutinyDocumentType,
  ScrutinyEvidenceState,
  ScrutinyRequirementApplicability,
  ScrutinySessionEventType,
  ScrutinyStandingType,
} from '../../../prisma/generated/prisma';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const COMMISSION_CODE = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
const TIME_ZONE = /^[A-Za-z][A-Za-z0-9._+-]*(\/[A-Za-z][A-Za-z0-9._+-]*)+$/;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;
const lowerTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const upperTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

@ValidatorConstraint({ name: 'scrutinyDurableHttps', async: false })
class DurableHttpsConstraint implements ValidatorConstraintInterface {
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

  defaultMessage(): string {
    return 'La fuente debe usar HTTPS y no puede incluir credenciales';
  }
}

@ValidatorConstraint({ name: 'scrutinyIanaTimeZone', async: false })
class IanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !TIME_ZONE.test(value)) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'timeZone debe ser una zona IANA reconocida';
  }
}

export abstract class ScrutinyCommandDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lowerTrim)
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  payloadSha256: string;
}

export class ScrutinyResourceParamsDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  id: string;
}

export class CreateScrutinyCommissionDto extends ScrutinyCommandDto {
  @ApiProperty({ pattern: COMMISSION_CODE.source })
  @Transform(upperTrim)
  @Matches(COMMISSION_CODE)
  code: string;

  @ApiProperty({ enum: ScrutinyCommissionLevel })
  @IsEnum(ScrutinyCommissionLevel)
  level: ScrutinyCommissionLevel;

  @ApiProperty({ minLength: 3, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  scopeDivisionId?: string;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  scopeCode: string;

  @ApiProperty({ minLength: 2, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  scopeName: string;

  @ApiProperty({ minLength: 3, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  venue: string;

  @ApiProperty({ example: 'America/Bogota' })
  @Transform(trim)
  @Validate(IanaTimeZoneConstraint)
  timeZone: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  scheduledStartsAt: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  scheduledEndsAt: string;

  @ApiProperty({ format: 'uri' })
  @Transform(trim)
  @Validate(DurableHttpsConstraint)
  calendarSourceUrl: string;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  calendarSourceReference: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  legalLeadUserId: string;

  @ApiProperty({ minLength: 50, maxLength: 4000 })
  @Transform(trim)
  @IsString()
  @MinLength(50)
  @MaxLength(4_000)
  escalationRoute: string;

  @ApiProperty({ minLength: 50, maxLength: 4000 })
  @Transform(trim)
  @IsString()
  @MinLength(50)
  @MaxLength(4_000)
  contingencyPlan: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  offlineDrillAt?: string;
}

export class ConfigureScrutinyRequirementDto extends ScrutinyCommandDto {
  @ApiProperty({ enum: ScrutinyDocumentType })
  @IsEnum(ScrutinyDocumentType)
  documentType: ScrutinyDocumentType;

  @ApiProperty({ enum: ScrutinyRequirementApplicability })
  @IsEnum(ScrutinyRequirementApplicability)
  applicability: ScrutinyRequirementApplicability;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  rationale: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class RecordScrutinySessionEventDto extends ScrutinyCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ enum: ScrutinySessionEventType })
  @IsEnum(ScrutinySessionEventType)
  type: ScrutinySessionEventType;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  occurredAt: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2_000)
  notes: string;
}

export class CreateScrutinyCoverageDto extends ScrutinyCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  witnessId: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  credentialDocumentId: string;

  @ApiProperty({ minLength: 3, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  credentialReference: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  validFrom: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  validUntil: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  shiftStartsAt: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  shiftEndsAt: string;

  @ApiPropertyOptional({ enum: ScrutinyCoverageStatus })
  @IsOptional()
  @IsEnum(ScrutinyCoverageStatus)
  status?: ScrutinyCoverageStatus;
}

export class CreateScrutinyDocumentDto extends ScrutinyCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  commissionId: string;

  @ApiProperty({ enum: ScrutinyDocumentType })
  @IsEnum(ScrutinyDocumentType)
  type: ScrutinyDocumentType;

  @ApiProperty({ enum: ScrutinyEvidenceState })
  @IsEnum(ScrutinyEvidenceState)
  evidenceState: ScrutinyEvidenceState;

  @ApiProperty({ maxLength: 512 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  storagePath: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  sha256: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  size: number;

  @ApiProperty()
  @Transform(trim)
  @IsMimeType()
  @MaxLength(150)
  contentType: string;

  @ApiProperty({ minLength: 2, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  declaredIssuer: string;

  @ApiProperty({ minLength: 2, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  authorityInstance: string;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  versionLabel: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  cutoffAt: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  supersedesDocumentId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  externalAt?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  externalChannel?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  externalReference?: string;
}

export class ReviewScrutinyDocumentDto extends ScrutinyCommandDto {
  @ApiProperty({ enum: ScrutinyDocumentReviewDecision })
  @IsEnum(ScrutinyDocumentReviewDecision)
  decision: ScrutinyDocumentReviewDecision;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  reason: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class RecordScrutinyCustodyEventDto extends ScrutinyCommandDto {
  @ApiProperty({ enum: ScrutinyCustodyEventType })
  @IsEnum(ScrutinyCustodyEventType)
  type: ScrutinyCustodyEventType;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  occurredAt: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fromCustodian?: string;

  @ApiProperty({ minLength: 2, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  toCustodian: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2_000)
  notes: string;
}

export class CreateScrutinyDiscrepancyDto extends ScrutinyCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  commissionId: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  sourceDocumentId: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  comparisonDocumentId: string;

  @ApiProperty({ minLength: 2, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  scopeReference: string;

  @ApiProperty({ minLength: 1, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  candidacyReference: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sourceValue: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  comparisonValue: number;

  @ApiProperty({ minLength: 3, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  classification: string;

  @ApiProperty({ enum: ScrutinyDiscrepancySeverity })
  @IsEnum(ScrutinyDiscrepancySeverity)
  severity: ScrutinyDiscrepancySeverity;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  responsibleUserId: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  dueAt: string;
}

export class ResolveScrutinyDiscrepancyDto extends ScrutinyCommandDto {
  @ApiProperty({ enum: ScrutinyDiscrepancyStatus })
  @IsEnum(ScrutinyDiscrepancyStatus)
  status: ScrutinyDiscrepancyStatus;

  @ApiProperty({ minLength: 30, maxLength: 3000 })
  @Transform(trim)
  @IsString()
  @MinLength(30)
  @MaxLength(3_000)
  resolution: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  resolutionDocumentId: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class CreateScrutinyActionDto extends ScrutinyCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  commissionId: string;

  @ApiProperty({ enum: ScrutinyActionType })
  @IsEnum(ScrutinyActionType)
  type: ScrutinyActionType;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  parentActionId?: string;

  @ApiProperty({ enum: ScrutinyStandingType })
  @IsEnum(ScrutinyStandingType)
  standingType: ScrutinyStandingType;

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(1_000)
  standingBasis: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  accreditedCoverageId?: string;

  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(upperTrim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  legalGroundCode: string;

  @ApiProperty({ minLength: 2, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  legalGroundVersion: string;

  @ApiProperty({ format: 'uri' })
  @Transform(trim)
  @Validate(DurableHttpsConstraint)
  legalGroundSourceUrl: string;

  @ApiProperty({ minLength: 30, maxLength: 8000 })
  @Transform(trim)
  @IsString()
  @MinLength(30)
  @MaxLength(8_000)
  facts: string;

  @ApiProperty({ minLength: 30, maxLength: 8000 })
  @Transform(trim)
  @IsString()
  @MinLength(30)
  @MaxLength(8_000)
  legalBasis: string;

  @ApiProperty({ type: [String], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  affectedReferences: string[];

  @ApiProperty({ minLength: 2, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  authority: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  deadlineAt: string;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  deadlineRule: string;

  @ApiProperty({ example: 'America/Bogota' })
  @Transform(trim)
  @Validate(IanaTimeZoneConstraint)
  timeZone: string;

  @ApiProperty({ minLength: 50, maxLength: 12000 })
  @Transform(trim)
  @IsString()
  @MinLength(50)
  @MaxLength(12_000)
  text: string;
}

export class AddScrutinyActionVersionDto extends ScrutinyCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ minLength: 50, maxLength: 12000 })
  @Transform(trim)
  @IsString()
  @MinLength(50)
  @MaxLength(12_000)
  text: string;
}

export class ApproveScrutinyActionDto extends ScrutinyCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  reviewNote: string;
}

export class FileScrutinyActionDto extends ScrutinyCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  supportDocumentId: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  filedAt: string;

  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  channel: string;

  @ApiProperty({ minLength: 2, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  filingReference: string;
}

export class RecordScrutinyDecisionDto extends ScrutinyCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ enum: ScrutinyDecisionOutcome })
  @IsEnum(ScrutinyDecisionOutcome)
  outcome: ScrutinyDecisionOutcome;

  @ApiProperty({ minLength: 2, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  authority: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  decidedAt: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  decisionDocumentId: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  notifiedAt?: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  notificationDocumentId?: string;

  @ApiProperty({ minLength: 30, maxLength: 4000 })
  @Transform(trim)
  @IsString()
  @MinLength(30)
  @MaxLength(4_000)
  reasoning: string;
}

export class ReviewScrutinyDecisionDto extends ScrutinyCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ enum: ScrutinyDocumentReviewDecision })
  @IsEnum(ScrutinyDocumentReviewDecision)
  decision: ScrutinyDocumentReviewDecision;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  reviewNote: string;
}

export class ScrutinyDeclaredResultLineDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  optionCode: string;

  @ApiProperty({ minLength: 1, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  optionLabel: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  votes?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  seats?: number;

  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  declaredStatus: string;
}

export class CreateScrutinyDeclarationDto extends ScrutinyCommandDto {
  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  commissionId?: string;

  @ApiProperty({ minLength: 2, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  scopeReference: string;

  @ApiProperty({ minLength: 2, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  authority: string;

  @ApiProperty({ minLength: 2, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  authorityReference: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  declaredAt: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  officialDocumentId: string;

  @ApiProperty({ type: [ScrutinyDeclaredResultLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ScrutinyDeclaredResultLineDto)
  lines: ScrutinyDeclaredResultLineDto[];
}

export class ReviewScrutinyDeclarationDto extends ScrutinyCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ enum: ScrutinyDeclarationReviewDecision })
  @IsEnum(ScrutinyDeclarationReviewDecision)
  decision: ScrutinyDeclarationReviewDecision;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  reviewNote: string;
}

export class ListScrutinyQueryDto {
  @ApiPropertyOptional({ enum: ScrutinyActionStatus })
  @IsOptional()
  @IsEnum(ScrutinyActionStatus)
  actionStatus?: ScrutinyActionStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
