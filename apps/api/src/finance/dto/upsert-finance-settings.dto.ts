import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FinanceReportScope } from '../../../prisma/generated/prisma';

const MAX_CAMPAIGN_AMOUNT = 9_999_999_999_999.99;
const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export function getFinanceSettingsCoherenceError(
  dto: Pick<
    UpsertFinanceSettingsDto,
    'maxTotalBudget' | 'maxPublicityLimit' | 'electionDate' | 'reportDeadline'
  >,
): string | null {
  if (
    typeof dto.maxPublicityLimit === 'number' &&
    typeof dto.maxTotalBudget === 'number' &&
    dto.maxPublicityLimit > dto.maxTotalBudget
  ) {
    return 'maxPublicityLimit no puede superar maxTotalBudget';
  }

  const electionDate = Date.parse(dto.electionDate);
  const reportDeadline = Date.parse(dto.reportDeadline);
  if (
    Number.isFinite(electionDate) &&
    Number.isFinite(reportDeadline) &&
    reportDeadline <= electionDate
  ) {
    return 'reportDeadline debe ser posterior a electionDate';
  }

  return null;
}

@ValidatorConstraint({ name: 'financeSettingsCoherence', async: false })
class FinanceSettingsCoherenceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    return (
      getFinanceSettingsCoherenceError(
        args.object as UpsertFinanceSettingsDto,
      ) === null
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return (
      getFinanceSettingsCoherenceError(
        args.object as UpsertFinanceSettingsDto,
      ) ?? 'El expediente financiero es inconsistente'
    );
  }
}

export class UpsertFinanceSettingsDto {
  @ApiProperty({ minimum: 0.01, maximum: MAX_CAMPAIGN_AMOUNT })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_CAMPAIGN_AMOUNT)
  maxTotalBudget: number;

  @ApiProperty({ minimum: 0.01, maximum: MAX_CAMPAIGN_AMOUNT })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_CAMPAIGN_AMOUNT)
  @Validate(FinanceSettingsCoherenceConstraint)
  maxPublicityLimit: number;

  @ApiProperty({ example: 'Elecciones territoriales 2027 - Alcaldía' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  electionName: string;

  @ApiProperty({ example: '2027-10-31' })
  @Transform(trim)
  @IsDateString({ strict: true })
  electionDate: string;

  @ApiProperty({ enum: FinanceReportScope })
  @IsEnum(FinanceReportScope)
  reportScope: FinanceReportScope;

  @ApiProperty({ example: 'Resolución CNE aplicable a la elección' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(250)
  officialLimitsReference: string;

  @ApiProperty({ example: 'https://www.cne.gov.co/resoluciones-cne-2027' })
  @Transform(trim)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Matches(/^https:\/\//i, { message: 'officialLimitsUrl debe usar HTTPS' })
  @MaxLength(2048)
  officialLimitsUrl: string;

  @ApiProperty({ example: '2027-11-30' })
  @Transform(trim)
  @IsDateString({ strict: true })
  reportDeadline: string;

  @ApiProperty({ example: 'Responsable financiero de campaña' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  financialManagerName: string;

  @ApiProperty({ example: '1234567890' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  @Matches(/^[\p{L}\p{N}.-]+$/u, {
    message:
      'financialManagerDocument solo admite letras, números, punto y guion',
  })
  financialManagerDocument: string;

  @ApiProperty({ example: 'Contador responsable' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  accountantName: string;

  @ApiProperty({ example: '9876543210' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  @Matches(/^[\p{L}\p{N}.-]+$/u, {
    message: 'accountantDocument solo admite letras, números, punto y guion',
  })
  accountantDocument: string;

  @ApiProperty({ example: 'Banco autorizado' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  uniqueAccountBank: string;

  @ApiProperty({ example: '1234' })
  @Transform(trim)
  @Matches(/^\d{4}$/, {
    message: 'uniqueAccountLastFour debe contener exactamente cuatro dígitos',
  })
  uniqueAccountLastFour: string;

  @ApiProperty({ example: 'CC-CANDIDATO-2027-001' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u, {
    message: 'cuentasClarasCode contiene caracteres no permitidos',
  })
  cuentasClarasCode: string;
}
