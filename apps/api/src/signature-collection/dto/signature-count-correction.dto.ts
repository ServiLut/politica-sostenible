import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_COUNT = 1_000_000_000;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const lowerTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export enum SignatureCountCorrectionDecisionInput {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export abstract class SignatureCountCorrectionCommandDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lowerTrim)
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  payloadSha256: string;
}

@ValidatorConstraint({ name: 'signatureCorrectionArithmetic', async: false })
class SignatureCorrectionArithmeticConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const value = args.object as ProposeSignatureCountCorrectionDto;
    const counts = [
      value.proposedPlannedForms,
      value.proposedIssuedForms,
      value.proposedReturnedForms,
      value.proposedAnnulledForms,
      value.proposedMissingForms,
      value.proposedInCustodyForms,
      value.proposedReportedSupports,
      value.proposedInternalAcceptedSupports,
      value.proposedInternalRejectedSupports,
      value.proposedPossibleDuplicateSupports,
    ];
    if (!counts.every(Number.isInteger)) return true;
    return (
      value.proposedReturnedForms +
        value.proposedAnnulledForms +
        value.proposedMissingForms +
        value.proposedInCustodyForms ===
        value.proposedIssuedForms &&
      value.proposedInternalAcceptedSupports +
        value.proposedInternalRejectedSupports ===
        value.proposedReportedSupports &&
      value.proposedPossibleDuplicateSupports <=
        value.proposedInternalRejectedSupports
    );
  }

  defaultMessage(): string {
    return 'Los conteos propuestos deben conservar formularios, clasificar todos los apoyos y no declarar duplicados por encima de los rechazos';
  }
}

export class ProposeSignatureCountCorrectionDto extends SignatureCountCorrectionCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  reason: string;

  @ApiProperty({ maxLength: 512 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  evidenceStoragePath: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  evidenceSha256: string;

  @ApiProperty({ minimum: 1, maximum: MAX_COUNT })
  @IsInt()
  @Min(1)
  @Max(MAX_COUNT)
  proposedPlannedForms: number;

  @ApiProperty({ minimum: 0, maximum: MAX_COUNT })
  @IsInt()
  @Min(0)
  @Max(MAX_COUNT)
  proposedIssuedForms: number;

  @ApiProperty({ minimum: 0, maximum: MAX_COUNT })
  @IsInt()
  @Min(0)
  @Max(MAX_COUNT)
  proposedReturnedForms: number;

  @ApiProperty({ minimum: 0, maximum: MAX_COUNT })
  @IsInt()
  @Min(0)
  @Max(MAX_COUNT)
  proposedAnnulledForms: number;

  @ApiProperty({ minimum: 0, maximum: MAX_COUNT })
  @IsInt()
  @Min(0)
  @Max(MAX_COUNT)
  proposedMissingForms: number;

  @ApiProperty({ minimum: 0, maximum: MAX_COUNT })
  @IsInt()
  @Min(0)
  @Max(MAX_COUNT)
  proposedInCustodyForms: number;

  @ApiProperty({ minimum: 0, maximum: MAX_COUNT })
  @IsInt()
  @Min(0)
  @Max(MAX_COUNT)
  proposedReportedSupports: number;

  @ApiProperty({ minimum: 0, maximum: MAX_COUNT })
  @IsInt()
  @Min(0)
  @Max(MAX_COUNT)
  proposedInternalAcceptedSupports: number;

  @ApiProperty({ minimum: 0, maximum: MAX_COUNT })
  @IsInt()
  @Min(0)
  @Max(MAX_COUNT)
  proposedInternalRejectedSupports: number;

  @ApiProperty({ minimum: 0, maximum: MAX_COUNT })
  @IsInt()
  @Min(0)
  @Max(MAX_COUNT)
  proposedPossibleDuplicateSupports: number;

  @ApiPropertyOptional({ readOnly: true })
  @Validate(SignatureCorrectionArithmeticConstraint)
  readonly countInvariants?: never;
}

export class DecideSignatureCountCorrectionDto extends SignatureCountCorrectionCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ enum: SignatureCountCorrectionDecisionInput })
  @IsEnum(SignatureCountCorrectionDecisionInput)
  decision: SignatureCountCorrectionDecisionInput;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  reviewReason: string;
}

export class SignatureCountCorrectionProposalParamsDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lowerTrim)
  @IsUUID('4')
  id: string;
}
