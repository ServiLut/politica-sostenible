import { Transform, type TransformFnParams } from 'class-transformer';
import {
  Equals,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { PoliticalOperationStage } from '../../../prisma/generated/prisma';
import { UpsertOperationProfileDto } from './upsert-operation-profile.dto';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

export const ADOPTABLE_OPERATION_STAGES = [
  PoliticalOperationStage.SIGNATURE_COLLECTION,
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
] as const;

export enum OperationAdoptionDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrim = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized || undefined;
};

@ValidatorConstraint({ name: 'adoptionReviewCoherence', async: false })
class AdoptionReviewCoherenceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as ReviewOperationStageAdoptionDto;
    const reason = dto.rejectionReason?.trim();
    return dto.decision === OperationAdoptionDecision.REJECT
      ? Boolean(reason && reason.length >= 20)
      : !reason;
  }

  defaultMessage(): string {
    return 'El rechazo exige una razon de al menos 20 caracteres y la aprobacion no admite razon de rechazo';
  }
}

export class CreateOperationStageAdoptionDto extends OmitType(
  UpsertOperationProfileDto,
  ['stage', 'expectedUpdatedAt'] as const,
) {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(trim)
  @Matches(SHA256)
  payloadSha256: string;

  @ApiProperty({ enum: ADOPTABLE_OPERATION_STAGES })
  @IsEnum(PoliticalOperationStage)
  @IsIn(ADOPTABLE_OPERATION_STAGES)
  targetStage: PoliticalOperationStage;

  @ApiProperty({ description: 'Instante real desde el cual opera la etapa' })
  @Transform(trim)
  @IsDateString({ strict: true })
  effectiveAt: string;

  @ApiProperty({ minLength: 80, maxLength: 4000 })
  @Transform(trim)
  @IsString()
  @MinLength(80)
  @MaxLength(4_000)
  justification: string;

  @ApiProperty({ minLength: 3, maxLength: 512 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  evidenceReference: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(trim)
  @Matches(SHA256)
  evidenceSha256: string;

  @ApiProperty({ example: true })
  @Equals(true, {
    message:
      'Debe reconocer expresamente que el historial anterior en el sistema es incompleto',
  })
  incompleteHistoryAcknowledged: true;
}

export class OperationStageAdoptionIdParamsDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Matches(SAFE_IDENTIFIER)
  id: string;
}

export class ReviewOperationStageAdoptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientReviewId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(trim)
  @Matches(SHA256)
  expectedPayloadSha256: string;

  @ApiProperty({ enum: OperationAdoptionDecision })
  @IsEnum(OperationAdoptionDecision)
  @Validate(AdoptionReviewCoherenceConstraint)
  decision: OperationAdoptionDecision;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(trim)
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
