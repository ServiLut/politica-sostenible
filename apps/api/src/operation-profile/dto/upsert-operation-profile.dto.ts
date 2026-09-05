import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CandidateListType,
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationStage,
  PoliticalOperationType,
} from '../../../prisma/generated/prisma';

const MAX_CAMPAIGN_AMOUNT = 9_999_999_999_999.99;
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const CORPORATION_ELECTIONS = new Set<ElectoralContestType>([
  ElectoralContestType.SENATE,
  ElectoralContestType.HOUSE_OF_REPRESENTATIVES,
  ElectoralContestType.DEPARTMENTAL_ASSEMBLY,
  ElectoralContestType.MUNICIPAL_COUNCIL,
  ElectoralContestType.LOCAL_ADMINISTRATIVE_BOARD,
]);

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrim = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized || undefined;
};

export function getOperationProfileCoherenceError(
  dto: Pick<
    UpsertOperationProfileDto,
    | 'operationType'
    | 'electionType'
    | 'listType'
    | 'candidateCount'
    | 'maxTotalBudget'
    | 'maxPublicityLimit'
  >,
): string | null {
  const supportsCandidateList =
    dto.operationType === PoliticalOperationType.CORPORATION_CANDIDACY ||
    dto.operationType === PoliticalOperationType.PARTY_MOVEMENT;

  if (
    dto.operationType === PoliticalOperationType.CORPORATION_CANDIDACY &&
    !dto.listType
  ) {
    return 'El tipo de lista es obligatorio para una candidatura a corporacion publica';
  }
  if (dto.listType && !supportsCandidateList) {
    return 'El tipo de lista solo aplica a candidaturas a corporacion o a partidos y movimientos';
  }

  const singleCandidateTypes = new Set<PoliticalOperationType>([
    PoliticalOperationType.PRE_CANDIDACY,
    PoliticalOperationType.SINGLE_CANDIDACY,
    PoliticalOperationType.SIGNATURE_COMMITTEE,
  ]);
  const requiresSingleCandidate = singleCandidateTypes.has(dto.operationType);
  if (requiresSingleCandidate && dto.candidateCount !== 1) {
    return 'Esta operacion debe registrar exactamente una candidatura';
  }

  const isCorporationElection = CORPORATION_ELECTIONS.has(dto.electionType);
  if (
    dto.operationType === PoliticalOperationType.CORPORATION_CANDIDACY &&
    !isCorporationElection
  ) {
    return 'La candidatura a corporacion debe seleccionar una eleccion colegiada';
  }
  if (
    dto.operationType === PoliticalOperationType.SINGLE_CANDIDACY &&
    isCorporationElection
  ) {
    return 'Una candidatura uninominal no puede configurarse para una corporacion publica';
  }

  if (dto.maxPublicityLimit > dto.maxTotalBudget) {
    return 'El limite de publicidad no puede superar el presupuesto total';
  }

  return null;
}

@ValidatorConstraint({ name: 'operationProfileCoherence', async: false })
class OperationProfileCoherenceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    return (
      getOperationProfileCoherenceError(
        args.object as UpsertOperationProfileDto,
      ) === null
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return (
      getOperationProfileCoherenceError(
        args.object as UpsertOperationProfileDto,
      ) ?? 'La configuracion politica no es coherente'
    );
  }
}

export class UpsertOperationProfileDto {
  @ApiProperty({ enum: PoliticalOperationType })
  @IsEnum(PoliticalOperationType)
  @Validate(OperationProfileCoherenceConstraint)
  operationType: PoliticalOperationType;

  @ApiProperty({ enum: PoliticalOperationStage })
  @IsEnum(PoliticalOperationStage)
  stage: PoliticalOperationStage;

  @ApiProperty({ enum: ElectoralContestType })
  @IsEnum(ElectoralContestType)
  electionType: ElectoralContestType;

  @ApiProperty({ enum: ElectoralCircumscriptionType })
  @IsEnum(ElectoralCircumscriptionType)
  circumscriptionType: ElectoralCircumscriptionType;

  @ApiProperty({ example: 'Municipio de Medellin', maxLength: 160 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  circumscriptionName: string;

  @ApiPropertyOptional({ example: '05001', maxLength: 64 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[\p{L}\p{N}._/-]+$/u, {
    message:
      'El codigo de circunscripcion solo admite letras, numeros, punto, guion, barra y guion bajo',
  })
  circumscriptionCode?: string;

  @ApiPropertyOptional({ enum: CandidateListType })
  @IsOptional()
  @IsEnum(CandidateListType)
  listType?: CandidateListType;

  @ApiProperty({ example: '2027-10-31T13:00:00.000Z' })
  @Transform(trim)
  @IsDateString({ strict: true })
  electionDate: string;

  @ApiProperty({ minimum: 1, maximum: 100000, example: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  expectedTeamSize: number;

  @ApiProperty({ minimum: 1, maximum: 10000, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  candidateCount: number;

  @ApiProperty({ minimum: 0.01, example: 500000000 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_CAMPAIGN_AMOUNT)
  maxTotalBudget: number;

  @ApiProperty({ minimum: 0.01, example: 100000000 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_CAMPAIGN_AMOUNT)
  maxPublicityLimit: number;

  @ApiProperty({ example: 'Comite ciudadano responsable', maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  dataControllerName: string;

  @ApiProperty({ description: 'Usuario activo responsable de datos' })
  @Transform(trim)
  @IsString()
  @Matches(SAFE_IDENTIFIER, {
    message: 'El responsable de datos no tiene un identificador valido',
  })
  responsibleDataUserId: string;

  @ApiProperty({ minimum: 1, maximum: 3650, example: 730 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3_650)
  retentionPeriodDays: number;

  @ApiProperty({
    description:
      'Procedimiento claro para solicitar revocacion, supresion o correccion',
    maxLength: 2000,
  })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  revocationProcedure: string;

  @ApiPropertyOptional({
    description:
      'updatedAt recibido al abrir el formulario; obligatorio al modificar una configuracion existente',
  })
  @Transform(optionalTrim)
  @IsOptional()
  @IsDateString({ strict: true })
  expectedUpdatedAt?: string;
}
