import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
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
  PqrsdAuthorizationDecision,
  PqrsdCalendarExceptionType,
  PqrsdClosureCause,
  PqrsdCompetence,
  PqrsdDayComputationMethod,
  PqrsdDeliveryOutcome,
  PqrsdDocumentType,
  PqrsdDossierStatus,
  PqrsdResponseReviewDecision,
  PqrsdReviewDecision,
  PqrsdRiskLevel,
  PqrsdRuleReviewDecision,
  PqrsdTermStartRule,
} from '../../../prisma/generated/prisma';

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,119}$/u;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;
const lowerTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

@ValidatorConstraint({ name: 'pqrsdHttps', async: false })
class PqrsdHttpsConstraint implements ValidatorConstraintInterface {
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
    return 'La fuente normativa debe usar HTTPS y no incluir credenciales';
  }
}

@ValidatorConstraint({ name: 'pqrsdIanaTimeZone', async: false })
class PqrsdIanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length > 100) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
      return value === 'UTC' || value.includes('/');
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'timeZone debe ser una zona IANA reconocida';
  }
}

export abstract class PqrsdCommandDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lowerTrim)
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  payloadSha256: string;
}

export class PqrsdResourceParamsDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  id: string;
}

export class ListPqrsdQueryDto {
  @ApiPropertyOptional({ enum: PqrsdDossierStatus })
  @IsOptional()
  @IsEnum(PqrsdDossierStatus)
  status?: PqrsdDossierStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class PqrsdDetailQueryDto {
  @ApiProperty({ minLength: 10, maxLength: 1_000 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(1_000)
  purpose: string;
}

export class CreatePqrsdRuleDefinitionDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(KEY)
  classificationKey: string;

  @ApiProperty({ minLength: 3, maxLength: 240 })
  @Transform(trim)
  @MinLength(3)
  @MaxLength(240)
  label: string;

  @ApiProperty({ minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays: number;

  @ApiProperty({ enum: PqrsdDayComputationMethod })
  @IsEnum(PqrsdDayComputationMethod)
  dayMethod: PqrsdDayComputationMethod;

  @ApiProperty({ enum: PqrsdTermStartRule })
  @IsEnum(PqrsdTermStartRule)
  startRule: PqrsdTermStartRule;

  @ApiProperty({ minLength: 10, maxLength: 2_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(2_000)
  legalBasis: string;

  @ApiProperty()
  @IsBoolean()
  highRisk: boolean;
}

export class CreatePqrsdCalendarExceptionDto {
  @ApiProperty({ format: 'date' })
  @Matches(DATE_ONLY)
  localDate: string;

  @ApiProperty({ enum: PqrsdCalendarExceptionType })
  @IsEnum(PqrsdCalendarExceptionType)
  type: PqrsdCalendarExceptionType;

  @ApiProperty({ minLength: 3, maxLength: 240 })
  @Transform(trim)
  @MinLength(3)
  @MaxLength(240)
  label: string;

  @ApiProperty({ minLength: 5, maxLength: 1_000 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(1_000)
  sourceReference: string;
}

export class CreatePqrsdRulePackageDto extends PqrsdCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(KEY)
  scopeKey: string;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(trim)
  @MinLength(1)
  @MaxLength(80)
  versionLabel: string;

  @ApiProperty({ format: 'uri' })
  @Transform(trim)
  @Validate(PqrsdHttpsConstraint)
  sourceUrl: string;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(500)
  sourceReference: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  sourceSha256: string;

  @ApiProperty({ example: 'America/Bogota' })
  @Transform(trim)
  @Validate(PqrsdIanaTimeZoneConstraint)
  timeZone: string;

  @ApiProperty({ format: 'date' })
  @Matches(DATE_ONLY)
  effectiveFrom: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(DATE_ONLY)
  effectiveTo?: string;

  @ApiProperty({ type: [Number], description: '0 domingo ... 6 sabado' })
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  nonWorkingWeekdays: number[];

  @ApiProperty({ minLength: 10, maxLength: 1_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(1_000)
  computationMethodNote: string;

  @ApiProperty({ type: [CreatePqrsdRuleDefinitionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreatePqrsdRuleDefinitionDto)
  rules: CreatePqrsdRuleDefinitionDto[];

  @ApiProperty({ type: [CreatePqrsdCalendarExceptionDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreatePqrsdCalendarExceptionDto)
  exceptions: CreatePqrsdCalendarExceptionDto[];
}

export class ReviewPqrsdRulePackageDto extends PqrsdCommandDto {
  @ApiProperty({ enum: PqrsdRuleReviewDecision })
  @IsEnum(PqrsdRuleReviewDecision)
  decision: PqrsdRuleReviewDecision;

  @ApiProperty({ minLength: 10, maxLength: 2_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(2_000)
  rationale: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision: number;
}

export class PqrsdPetitionerDto {
  @ApiProperty({ minLength: 2, maxLength: 240 })
  @Transform(trim)
  @MinLength(2)
  @MaxLength(240)
  fullName: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(40)
  documentType?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(80)
  documentNumber?: string;

  @ApiPropertyOptional({ format: 'email' })
  @Transform(lowerTrim)
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ minLength: 7, maxLength: 60 })
  @Transform(optionalTrim)
  @IsOptional()
  @MinLength(7)
  @MaxLength(60)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(500)
  postalAddress?: string;

  @ApiProperty({ minLength: 2, maxLength: 80 })
  @Transform(trim)
  @MinLength(2)
  @MaxLength(80)
  preferredChannel: string;
}

export class CreatePqrsdDossierDto extends PqrsdCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(KEY)
  scopeKey: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  receivedAt: string;

  @ApiProperty({ example: 'America/Bogota' })
  @Transform(trim)
  @Validate(PqrsdIanaTimeZoneConstraint)
  receivedTimeZone: string;

  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(trim)
  @MinLength(2)
  @MaxLength(120)
  receivedChannel: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(160)
  externalReceiptNumber?: string;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(trim)
  @MinLength(3)
  @MaxLength(500)
  subject: string;

  @ApiProperty({ minLength: 10, maxLength: 20_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(20_000)
  description: string;

  @ApiProperty()
  @IsBoolean()
  acknowledgementRequired: boolean;

  @ApiProperty({ enum: PqrsdRiskLevel })
  @IsEnum(PqrsdRiskLevel)
  riskLevel: PqrsdRiskLevel;

  @ApiProperty({ type: PqrsdPetitionerDto })
  @ValidateNested()
  @Type(() => PqrsdPetitionerDto)
  petitioner: PqrsdPetitionerDto;
}

export class AttachPqrsdDocumentDto extends PqrsdCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  dossierId: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  storagePath: string;

  @ApiProperty({ enum: PqrsdDocumentType })
  @IsEnum(PqrsdDocumentType)
  type: PqrsdDocumentType;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @Transform(trim)
  @MinLength(1)
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  sha256: string;

  @ApiPropertyOptional({ maxLength: 1_000 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(1_000)
  sourceReference?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ReviewPqrsdDocumentDto extends PqrsdCommandDto {
  @ApiProperty({ enum: PqrsdReviewDecision })
  @IsEnum(PqrsdReviewDecision)
  decision: PqrsdReviewDecision;

  @ApiProperty({ minLength: 5, maxLength: 1_500 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(1_500)
  rationale: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class RecordPqrsdAcknowledgementDto extends PqrsdCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  documentId: string;

  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(trim)
  @MinLength(2)
  @MaxLength(160)
  acknowledgementNumber: string;

  @ApiProperty({ minLength: 2, maxLength: 100 })
  @Transform(trim)
  @MinLength(2)
  @MaxLength(100)
  channel: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  issuedAt: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ProposePqrsdClassificationDto extends PqrsdCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  ruleDefinitionId: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(KEY)
  categoryKey: string;

  @ApiProperty({ minLength: 3, maxLength: 240 })
  @Transform(trim)
  @MinLength(3)
  @MaxLength(240)
  categoryLabel: string;

  @ApiProperty({ enum: PqrsdCompetence })
  @IsEnum(PqrsdCompetence)
  competence: PqrsdCompetence;

  @ApiProperty({ minLength: 2, maxLength: 240 })
  @Transform(trim)
  @MinLength(2)
  @MaxLength(240)
  department: string;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(trim)
  @MinLength(3)
  @MaxLength(500)
  competentAuthority: string;

  @ApiProperty({ minLength: 10, maxLength: 2_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(2_000)
  rationale: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ReviewPqrsdClassificationDto extends PqrsdCommandDto {
  @ApiProperty({ enum: PqrsdReviewDecision })
  @IsEnum(PqrsdReviewDecision)
  decision: PqrsdReviewDecision;

  @ApiProperty({ minLength: 5, maxLength: 1_500 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(1_500)
  rationale: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(DATE_ONLY)
  manualDueLocalDate?: string;

  @ApiPropertyOptional({ minLength: 10, maxLength: 1_500 })
  @Transform(optionalTrim)
  @IsOptional()
  @MinLength(10)
  @MaxLength(1_500)
  manualDeadlineReason?: string;

  @ApiPropertyOptional({ minLength: 5, maxLength: 1_000 })
  @Transform(optionalTrim)
  @IsOptional()
  @MinLength(5)
  @MaxLength(1_000)
  manualDeadlineAuthority?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class RecordPqrsdAssignmentDto extends PqrsdCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  primaryAssigneeId: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  backupAssigneeId: string;

  @ApiProperty({ minLength: 5, maxLength: 1_500 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(1_500)
  reason: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  effectiveAt: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ProposePqrsdTransferDto extends PqrsdCommandDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(trim)
  @MinLength(3)
  @MaxLength(500)
  destination: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(500)
  destinationReference?: string;

  @ApiProperty({ minLength: 10, maxLength: 2_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(2_000)
  reason: string;

  @ApiProperty({ minLength: 5, maxLength: 1_500 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(1_500)
  legalAuthority: string;

  @ApiProperty({ format: 'date' })
  @Matches(DATE_ONLY)
  dueLocalDate: string;

  @ApiProperty({ example: 'America/Bogota' })
  @Transform(trim)
  @Validate(PqrsdIanaTimeZoneConstraint)
  timeZone: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  supportDocumentId: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ReviewPqrsdTransferDto extends PqrsdCommandDto {
  @ApiProperty({ enum: PqrsdReviewDecision })
  @IsEnum(PqrsdReviewDecision)
  decision: PqrsdReviewDecision;

  @ApiProperty({ minLength: 5, maxLength: 1_500 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(1_500)
  rationale: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class RecordPqrsdTransferAttemptDto extends PqrsdCommandDto {
  @ApiProperty({ enum: PqrsdDeliveryOutcome })
  @IsEnum(PqrsdDeliveryOutcome)
  outcome: PqrsdDeliveryOutcome;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  attemptedAt: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(500)
  externalReference?: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  evidenceDocumentId?: string;

  @ApiPropertyOptional({ maxLength: 1_500 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(1_500)
  failureReason?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ProposePqrsdExtensionDto extends PqrsdCommandDto {
  @ApiProperty({ format: 'date' })
  @Matches(DATE_ONLY)
  requestedDueLocalDate: string;

  @ApiProperty({ minLength: 10, maxLength: 2_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(2_000)
  reason: string;

  @ApiProperty({ minLength: 5, maxLength: 1_500 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(1_500)
  legalAuthority: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  supportDocumentId: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ReviewPqrsdExtensionDto extends PqrsdCommandDto {
  @ApiProperty({ enum: PqrsdReviewDecision })
  @IsEnum(PqrsdReviewDecision)
  decision: PqrsdReviewDecision;

  @ApiProperty({ minLength: 5, maxLength: 1_500 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(1_500)
  rationale: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class CreatePqrsdResponseVersionDto extends PqrsdCommandDto {
  @ApiProperty({ minLength: 20, maxLength: 50_000 })
  @Transform(trim)
  @MinLength(20)
  @MaxLength(50_000)
  body: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  attachmentDocumentId?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ReviewPqrsdResponseDto extends PqrsdCommandDto {
  @ApiProperty({ enum: PqrsdResponseReviewDecision })
  @IsEnum(PqrsdResponseReviewDecision)
  decision: PqrsdResponseReviewDecision;

  @ApiProperty({ minLength: 10, maxLength: 2_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(2_000)
  rationale: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class AuthorizePqrsdResponseDto extends PqrsdCommandDto {
  @ApiProperty({ enum: PqrsdAuthorizationDecision })
  @IsEnum(PqrsdAuthorizationDecision)
  decision: PqrsdAuthorizationDecision;

  @ApiProperty({ minLength: 10, maxLength: 2_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(2_000)
  rationale: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(500)
  authorizationReference?: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  authorizationDocumentId?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class RecordPqrsdDeliveryAttemptDto extends PqrsdCommandDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(trim)
  @MinLength(2)
  @MaxLength(120)
  channel: string;

  @ApiProperty({ enum: PqrsdDeliveryOutcome })
  @IsEnum(PqrsdDeliveryOutcome)
  outcome: PqrsdDeliveryOutcome;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  attemptedAt: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(500)
  externalReference?: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  evidenceDocumentId?: string;

  @ApiPropertyOptional({ maxLength: 1_500 })
  @Transform(optionalTrim)
  @IsOptional()
  @MaxLength(1_500)
  failureReason?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ClosePqrsdDossierDto extends PqrsdCommandDto {
  @ApiProperty({ enum: PqrsdClosureCause })
  @IsEnum(PqrsdClosureCause)
  cause: PqrsdClosureCause;

  @ApiProperty({ minLength: 10, maxLength: 2_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(2_000)
  rationale: string;

  @ApiProperty({ minLength: 5, maxLength: 1_500 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(1_500)
  legalAuthority: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  supportDocumentId?: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  closedAt: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class ReopenPqrsdDossierDto extends PqrsdCommandDto {
  @ApiProperty({ minLength: 10, maxLength: 2_000 })
  @Transform(trim)
  @MinLength(10)
  @MaxLength(2_000)
  reason: string;

  @ApiProperty({ minLength: 5, maxLength: 1_500 })
  @Transform(trim)
  @MinLength(5)
  @MaxLength(1_500)
  legalAuthority: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  supportDocumentId: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  reopenedAt: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}
