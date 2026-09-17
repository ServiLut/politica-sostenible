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
import { OperationTerminationCause } from '../../../prisma/generated/prisma';

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

export enum OperationTerminationDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

@ValidatorConstraint({ name: 'terminationCauseCoherence', async: false })
class TerminationCauseCoherenceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateOperationTerminationDto;
    const otherCause = dto.otherCause?.trim();
    return dto.cause === OperationTerminationCause.OTHER
      ? Boolean(otherCause && otherCause.length >= 50)
      : !otherCause;
  }

  defaultMessage(): string {
    return 'La causal OTHER exige una descripcion de al menos 50 caracteres; las causales explicitas no admiten reclasificacion libre';
  }
}

@ValidatorConstraint({ name: 'terminationReviewCoherence', async: false })
class TerminationReviewCoherenceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as ReviewOperationTerminationDto;
    const reason = dto.rejectionReason?.trim();
    return dto.decision === OperationTerminationDecision.REJECT
      ? Boolean(reason && reason.length >= 20)
      : !reason;
  }

  defaultMessage(): string {
    return 'El rechazo exige una razon de al menos 20 caracteres y la aprobacion no admite razon de rechazo';
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

export class CreateOperationTerminationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  payloadSha256: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  expectedProfileUpdatedAt: string;

  @ApiProperty({ enum: OperationTerminationCause })
  @IsEnum(OperationTerminationCause)
  @Validate(TerminationCauseCoherenceConstraint)
  cause: OperationTerminationCause;

  @ApiPropertyOptional({ minLength: 50, maxLength: 300 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(50)
  @MaxLength(300)
  otherCause?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  effectiveAt: string;

  @ApiProperty({ minLength: 120, maxLength: 6000 })
  @Transform(trim)
  @IsString()
  @MinLength(120)
  @MaxLength(6_000)
  explanation: string;

  @ApiProperty({ minLength: 3, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  authorityName: string;

  @ApiProperty({ minLength: 3, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  officialActType: string;

  @ApiProperty({ minLength: 3, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  officialActReference: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  officialActIssuedAt: string;

  @ApiProperty({ format: 'uri', maxLength: 2048 })
  @Transform(trim)
  @IsString()
  @MinLength(12)
  @MaxLength(2_048)
  @Validate(DurableHttpsReferenceConstraint)
  evidenceReference: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  evidenceSha256: string;

  @ApiProperty({ example: true })
  @Equals(true, {
    message:
      'Debe declarar que el cierre no elimina ni acredita el cumplimiento de las obligaciones supervivientes',
  })
  consequencesAcknowledged: true;
}

export class OperationTerminationIdParamsDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Matches(SAFE_IDENTIFIER)
  id: string;
}

export class ReviewOperationTerminationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientReviewId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  expectedPayloadSha256: string;

  @ApiProperty({ enum: OperationTerminationDecision })
  @IsEnum(OperationTerminationDecision)
  @Validate(TerminationReviewCoherenceConstraint)
  decision: OperationTerminationDecision;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  reviewPayloadSha256: string;

  @ApiPropertyOptional({ minLength: 20, maxLength: 2000 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  rejectionReason?: string;
}

export class CancelOperationTerminationDto {
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
