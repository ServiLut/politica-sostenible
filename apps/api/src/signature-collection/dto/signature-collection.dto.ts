import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
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
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  SignatureAuthorityOutcome,
  SignatureAuthorityReviewDecision,
} from '../../../prisma/generated/prisma';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const BATCH_CODE = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;
const lowerTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const upperTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

@ValidatorConstraint({ name: 'signatureDurableHttps', async: false })
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
    return 'La referencia debe usar HTTPS, no incluir credenciales y ser durable';
  }
}

export abstract class SignatureCommandDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lowerTrim)
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  payloadSha256: string;
}

export class SignatureResourceParamsDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Matches(SAFE_ID)
  id: string;
}

export class CreateSignatureCollectionPlanDto extends SignatureCommandDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  @Equals(3)
  committeeMemberCount: number;

  @ApiProperty({ format: 'uri' })
  @Transform(trim)
  @Validate(DurableHttpsConstraint)
  committeeEvidenceReference: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  committeeEvidenceSha256: string;

  @ApiProperty({ format: 'date' })
  @Transform(trim)
  @IsDateString({ strict: true })
  committeeRegisteredAt: string;

  @ApiProperty({ format: 'date' })
  @Transform(trim)
  @IsDateString({ strict: true })
  collectionStartsAt: string;

  @ApiProperty({ format: 'date' })
  @Transform(trim)
  @IsDateString({ strict: true })
  collectionClosesAt: string;

  @ApiProperty({ format: 'date' })
  @Transform(trim)
  @IsDateString({ strict: true })
  candidateRegistrationClosesAt: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  requiredThreshold: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  internalTarget: number;

  @ApiProperty({ format: 'uri' })
  @Transform(trim)
  @Validate(DurableHttpsConstraint)
  thresholdSourceUrl: string;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  thresholdSourceReference: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  thresholdSourceSha256: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  fileOwnerUserId: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  custodyOwnerUserId: string;

  @ApiProperty({ minLength: 100, maxLength: 6000 })
  @Transform(trim)
  @IsString()
  @MinLength(100)
  @MaxLength(6_000)
  formHandlingRules: string;

  @ApiProperty({ minLength: 50, maxLength: 4000 })
  @Transform(trim)
  @IsString()
  @MinLength(50)
  @MaxLength(4_000)
  deliveryPlan: string;

  @ApiProperty({ minLength: 50, maxLength: 4000 })
  @Transform(trim)
  @IsString()
  @MinLength(50)
  @MaxLength(4_000)
  contingencyPlan: string;

  @ApiProperty({ format: 'date' })
  @Transform(trim)
  @IsDateString({ strict: true })
  submissionDueAt: string;
}

export class CreateSignatureBatchDto extends SignatureCommandDto {
  @ApiProperty({ pattern: BATCH_CODE.source })
  @Transform(upperTrim)
  @Matches(BATCH_CODE)
  code: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  physicalSealReference?: string;

  @ApiProperty({ minLength: 2, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  territoryReference: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  plannedForms: number;

  @ApiProperty({ format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  expectedReturnAt: string;
}

export abstract class SignatureBatchMutationDto extends SignatureCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  observation: string;

  @ApiProperty({ format: 'uri' })
  @Transform(trim)
  @Validate(DurableHttpsConstraint)
  evidenceReference: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  evidenceSha256: string;
}

export class IssueSignatureBatchDto extends SignatureBatchMutationDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  issuedForms: number;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  receiverUserId: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  physicalSealReference?: string;
}

export class ReturnSignatureBatchDto extends SignatureBatchMutationDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  returnedForms: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  annulledForms: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  missingForms: number;

  @ApiProperty()
  @IsBoolean()
  finalReturn: boolean;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  receiverUserId: string;
}

export class ReviewSignatureBatchDto extends SignatureBatchMutationDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  reportedSupports: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  internalAcceptedSupports: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  internalRejectedSupports: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  possibleDuplicateSupports: number;
}

export enum SignatureBatchAdvanceAction {
  DELIVER_TO_COMMITTEE = 'DELIVER_TO_COMMITTEE',
  SUBMIT_TO_AUTHORITY = 'SUBMIT_TO_AUTHORITY',
}

export class AdvanceSignatureBatchDto extends SignatureBatchMutationDto {
  @ApiProperty({ enum: SignatureBatchAdvanceAction })
  @IsEnum(SignatureBatchAdvanceAction)
  action: SignatureBatchAdvanceAction;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  receiverUserId?: string;
}

export class QuarantineSignatureBatchDto extends SignatureBatchMutationDto {}

export class ReleaseSignatureBatchDto extends SignatureBatchMutationDto {
  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  receiverUserId?: string;
}

export class RecordSignatureAuthorityResultDto extends SignatureCommandDto {
  @ApiProperty({ minLength: 3, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  authorityName: string;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  authorityActReference: string;

  @ApiProperty({ format: 'date' })
  @Transform(trim)
  @IsDateString({ strict: true })
  authorityActIssuedAt: string;

  @ApiProperty({ format: 'uri' })
  @Transform(trim)
  @Validate(DurableHttpsConstraint)
  evidenceReference: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  evidenceSha256: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  submittedSupports: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  validSupports: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  invalidSupports: number;

  @ApiProperty({ enum: SignatureAuthorityOutcome })
  @IsEnum(SignatureAuthorityOutcome)
  outcome: SignatureAuthorityOutcome;
}

export class ReviewSignatureAuthorityResultDto extends SignatureCommandDto {
  @ApiProperty({ enum: SignatureAuthorityReviewDecision })
  @IsEnum(SignatureAuthorityReviewDecision)
  decision: SignatureAuthorityReviewDecision;

  @ApiPropertyOptional({ minLength: 20, maxLength: 2000 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  reason?: string;
}
