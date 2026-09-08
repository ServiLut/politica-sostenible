import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  E14FormType,
  WitnessCredentialType,
  WitnessReclamationGround,
} from '../../../prisma/generated/prisma';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateWitnessReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Transform(trim)
  puestoId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99_999)
  mesa: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  @Transform(trim)
  e14ImageUrl: string;

  @IsEnum(WitnessCredentialType)
  credentialType: WitnessCredentialType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Transform(trim)
  credentialReference: string;

  @IsISO8601({ strict: true })
  checkedInAt: string;

  @IsEnum(E14FormType)
  e14FormType: E14FormType;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99_999)
  candidateVotes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99_999)
  blankVotes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99_999)
  nullVotes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99_999)
  unmarkedVotes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99_999)
  totalTableVotes: number;

  @IsBoolean()
  hasWrittenClaim: boolean;

  @ValidateIf((report: CreateWitnessReportDto) => report.hasWrittenClaim)
  @IsEnum(WitnessReclamationGround)
  reclamationGround?: WitnessReclamationGround;

  @ValidateIf((report: CreateWitnessReportDto) => report.hasWrittenClaim)
  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  @MaxLength(2000)
  @Transform(trim)
  reclamationDescription?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  observations?: string;
}
