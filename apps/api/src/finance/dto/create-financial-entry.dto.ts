import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CneCode, EntryType } from '../../../prisma/generated/prisma';

const MAX_CAMPAIGN_AMOUNT = 9_999_999_999_999.99;

export class CreateFinancialEntryDto {
  @IsEnum(EntryType)
  type: EntryType;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_CAMPAIGN_AMOUNT)
  amount: number;

  @IsDateString()
  date: string;

  @ApiProperty({
    enum: CneCode,
    description:
      'Categoría operativa interna heredada; no representa un código oficial de Cuentas Claras',
  })
  @IsEnum(CneCode)
  cneCode: CneCode;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  vendorName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  vendorTaxId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  evidenceUrl?: string;
}
