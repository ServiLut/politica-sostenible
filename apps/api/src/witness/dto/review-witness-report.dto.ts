import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WitnessReportStatus } from '../../../prisma/generated/prisma';

const REVIEW_DECISIONS = [
  WitnessReportStatus.ACCEPTED,
  WitnessReportStatus.REJECTED,
] as const;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ReviewWitnessReportDto {
  @IsIn(REVIEW_DECISIONS)
  status: (typeof REVIEW_DECISIONS)[number];

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(1000)
  reviewReason: string;
}
