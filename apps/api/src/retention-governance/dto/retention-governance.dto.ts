import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  Equals,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { RetentionDataScope } from '../../../prisma/generated/prisma';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  return value.trim() || undefined;
};
const lowerTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export enum RetentionDispositionDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

@ValidatorConstraint({ name: 'retentionReviewCoherence', async: false })
class RetentionReviewCoherenceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as ReviewRetentionDispositionDto;
    const reason = dto.rejectionReason?.trim();
    if (dto.decision === RetentionDispositionDecision.APPROVE) {
      return dto.approvedNotExecutedAcknowledged === true && !reason;
    }
    return !dto.approvedNotExecutedAcknowledged && Boolean(reason?.length);
  }

  defaultMessage(): string {
    return 'La aprobacion exige reconocer que nada se ejecuta; el rechazo exige una razon y no admite ese reconocimiento';
  }
}

@ValidatorConstraint({ name: 'durableHttpsReference', async: false })
class DurableHttpsReferenceConstraint implements ValidatorConstraintInterface {
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
    return 'La evidencia debe ser una referencia HTTPS valida, durable y sin credenciales embebidas';
  }
}

export class RetentionPreviewQueryDto {
  @ApiProperty({ enum: RetentionDataScope })
  @IsEnum(RetentionDataScope)
  scope: RetentionDataScope;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @Transform(optionalTrim)
  @IsOptional()
  @IsDateString({ strict: true })
  cutoffAt?: string;
}

export class RetentionDispositionIdParamsDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Matches(SAFE_IDENTIFIER)
  id: string;
}

export class RetentionLegalHoldIdParamsDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Matches(SAFE_IDENTIFIER)
  id: string;
}

export class CreateRetentionDispositionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  payloadSha256: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  expectedPreviewSha256: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  expectedProfileUpdatedAt: string;

  @ApiProperty({ enum: RetentionDataScope })
  @IsEnum(RetentionDataScope)
  scope: RetentionDataScope;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  cutoffAt: string;

  @ApiProperty({ minLength: 100, maxLength: 6000 })
  @Transform(trim)
  @IsString()
  @MinLength(100)
  @MaxLength(6_000)
  justification: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2_000)
  legalReference: string;

  @ApiProperty({ format: 'uri', maxLength: 2048 })
  @Transform(trim)
  @IsString()
  @MaxLength(2_048)
  @Validate(DurableHttpsReferenceConstraint)
  evidenceReference: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  evidenceSha256: string;

  @ApiProperty({ example: true })
  @Equals(true)
  legalPolicyRequiredAcknowledged: true;

  @ApiProperty({ example: true })
  @Equals(true)
  backupRestoreRequiredAcknowledged: true;

  @ApiProperty({ example: true })
  @Equals(true)
  executorUnavailableAcknowledged: true;
}

export class ReviewRetentionDispositionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientReviewId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  expectedPayloadSha256: string;

  @ApiProperty({ enum: RetentionDispositionDecision })
  @IsEnum(RetentionDispositionDecision)
  @Validate(RetentionReviewCoherenceConstraint)
  decision: RetentionDispositionDecision;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  reviewPayloadSha256: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Equals(true)
  approvedNotExecutedAcknowledged?: true;

  @ApiPropertyOptional({ minLength: 20, maxLength: 2000 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  rejectionReason?: string;
}

export class CancelRetentionDispositionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientCancellationId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  expectedPayloadSha256: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  cancellationPayloadSha256: string;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  reason: string;
}

export class CreateRetentionLegalHoldDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  payloadSha256: string;

  @ApiProperty({ enum: RetentionDataScope })
  @IsEnum(RetentionDataScope)
  scope: RetentionDataScope;

  @ApiProperty({ minLength: 50, maxLength: 6000 })
  @Transform(trim)
  @IsString()
  @MinLength(50)
  @MaxLength(6_000)
  reason: string;

  @ApiProperty({ minLength: 3, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  legalAuthority: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2_000)
  legalReference: string;

  @ApiProperty({ format: 'uri', maxLength: 2048 })
  @Transform(trim)
  @IsString()
  @MaxLength(2_048)
  @Validate(DurableHttpsReferenceConstraint)
  evidenceReference: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  evidenceSha256: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  effectiveAt: string;
}

export class RevokeRetentionLegalHoldDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  expectedHoldPayloadSha256: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  payloadSha256: string;

  @ApiProperty({ minLength: 50, maxLength: 6000 })
  @Transform(trim)
  @IsString()
  @MinLength(50)
  @MaxLength(6_000)
  reason: string;

  @ApiProperty({ minLength: 3, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  legalAuthority: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2_000)
  legalReference: string;

  @ApiProperty({ format: 'uri', maxLength: 2048 })
  @Transform(trim)
  @IsString()
  @MaxLength(2_048)
  @Validate(DurableHttpsReferenceConstraint)
  evidenceReference: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  evidenceSha256: string;
}
