import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  FinanceApprovalDecision,
  FinanceBankMatchStatus,
  FinanceExternalReviewDecision,
  FinanceReportKind,
} from '../../../prisma/generated/prisma';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SUBJECT_CODE = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
const LAST_FOUR = /^\d{4}$/;
const MAX_AMOUNT = 9_999_999_999_999.99;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;
const lowerTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const upperTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export abstract class FinanceCloseoutCommandDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lowerTrim)
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(lowerTrim)
  @Matches(SHA256)
  payloadSha256: string;
}

export class FinanceCloseoutResourceParamsDto {
  @Transform(trim)
  @Matches(SAFE_ID)
  id: string;
}

export class CreateFinanceDossierDto extends FinanceCloseoutCommandDto {
  @IsEnum(FinanceReportKind)
  kind: FinanceReportKind;

  @Transform(upperTrim)
  @Matches(SUBJECT_CODE)
  subjectCode: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subjectName: string;
}

export class FinanceBankStatementLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  lineNumber: number;

  @IsDateString({ strict: true })
  occurredAt: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  bankReference: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  debit: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  credit: number;

  @IsEnum(FinanceBankMatchStatus)
  matchStatus: FinanceBankMatchStatus;

  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID)
  matchedEntryId?: string;

  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  exclusionReason?: string;
}

export class CreateFinanceBankStatementDto extends FinanceCloseoutCommandDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  bankName: string;

  @Transform(trim)
  @Matches(LAST_FOUR)
  accountLastFour: string;

  @IsDateString({ strict: true })
  periodStartsAt: string;

  @IsDateString({ strict: true })
  periodEndsAt: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Max(MAX_AMOUNT)
  openingBalance: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Max(MAX_AMOUNT)
  closingBalance: number;

  @Transform(trim)
  @IsString()
  @MaxLength(512)
  storagePath: string;

  @Transform(lowerTrim)
  @Matches(SHA256)
  statementSha256: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FinanceBankStatementLineDto)
  lines: FinanceBankStatementLineDto[];
}

export class CreateFinanceInKindDto extends FinanceCloseoutCommandDto {
  @Transform(trim)
  @Matches(SAFE_ID)
  incomeEntryId: string;

  @Transform(trim)
  @Matches(SAFE_ID)
  expenseEntryId: string;

  @Transform(trim)
  @IsString()
  @MaxLength(512)
  storagePath: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  contributorName: string;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  contributorDocument: string;

  @IsDateString({ strict: true })
  contributionDate: string;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  description: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_AMOUNT)
  value: number;

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  valuationMethod: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(2048)
  valuationSourceReference: string;

  @Transform(lowerTrim)
  @Matches(SHA256)
  valuationSha256: string;
}

export class CreateFinancePayableDto extends FinanceCloseoutCommandDto {
  @Transform(trim)
  @Matches(SAFE_ID)
  expenseEntryId: string;

  @Transform(trim)
  @IsString()
  @MaxLength(512)
  storagePath: string;

  @Transform(lowerTrim)
  @Matches(SHA256)
  supportSha256: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  creditorName: string;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  creditorTaxId: string;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  description: string;

  @IsDateString({ strict: true })
  incurredAt: string;

  @IsDateString({ strict: true })
  dueAt: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_AMOUNT)
  originalAmount: number;
}

export class SettleFinancePayableDto extends FinanceCloseoutCommandDto {
  @Transform(trim)
  @IsUUID('4')
  bankStatementLineId: string;

  @Transform(trim)
  @IsString()
  @MaxLength(512)
  storagePath: string;

  @Transform(lowerTrim)
  @Matches(SHA256)
  supportSha256: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_AMOUNT)
  amount: number;

  @IsDateString({ strict: true })
  paidAt: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  paymentReference: string;
}

export class CreateFinanceReportVersionDto extends FinanceCloseoutCommandDto {
  @IsDateString({ strict: true })
  periodStartsAt: string;

  @IsDateString({ strict: true })
  periodEndsAt: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(optionalTrim)
  @IsOptional()
  @IsUUID('4')
  basedOnVersionId?: string;

  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  correctionReason?: string;

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  preparationNote: string;
}

export class ApproveFinanceReportVersionDto extends FinanceCloseoutCommandDto {
  @IsEnum(FinanceApprovalDecision)
  decision: FinanceApprovalDecision;

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  rationale: string;
}

export class RecordFinanceExternalEvidenceDto extends FinanceCloseoutCommandDto {
  @Transform(trim)
  @IsString()
  @MaxLength(512)
  storagePath: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  authorityName: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  channel: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  externalReference: string;

  @IsDateString({ strict: true })
  submittedAt: string;

  @Transform(lowerTrim)
  @Matches(SHA256)
  evidenceSha256: string;
}

export class ReviewFinanceExternalEvidenceDto extends FinanceCloseoutCommandDto {
  @IsEnum(FinanceExternalReviewDecision)
  decision: FinanceExternalReviewDecision;

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reviewNote: string;
}
