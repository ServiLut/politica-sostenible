import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FinanceStatus } from '../../../prisma/generated/prisma';

const FINAL_REVIEW_STATUSES = [
  FinanceStatus.APPROVED,
  FinanceStatus.REJECTED,
] as const;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ReviewFinancialEntryDto {
  @IsIn(FINAL_REVIEW_STATUSES)
  status: (typeof FINAL_REVIEW_STATUSES)[number];

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(500)
  reviewReason: string;
}
