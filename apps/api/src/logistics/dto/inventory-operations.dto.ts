import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const WAREHOUSE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const DISPATCH_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;

export const INVENTORY_TRACKING_MODES = ['NONE', 'LOT', 'SERIAL'] as const;
export type InventoryTrackingModeValue =
  (typeof INVENTORY_TRACKING_MODES)[number];

export const INVENTORY_INCIDENT_TYPES = [
  'MISSING',
  'DAMAGED',
  'EXPIRED',
  'CUSTODY_BREACH',
  'OTHER',
] as const;
export type InventoryIncidentTypeValue =
  (typeof INVENTORY_INCIDENT_TYPES)[number];

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const upperTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const lowerTrim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const optionalTrim = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  return value.trim() || undefined;
};
const optionalUpperTrim = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  return value.trim().toUpperCase() || undefined;
};

export abstract class InventoryIdempotentCommandDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: SHA256_PATTERN.source })
  @Transform(lowerTrim)
  @Matches(SHA256_PATTERN)
  payloadSha256: string;
}

export class InventoryEntityIdParamsDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID_PATTERN)
  id: string;
}

export class InventoryOverviewQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID_PATTERN)
  warehouseId?: string;
}

export class CreateInventoryWarehouseDto extends InventoryIdempotentCommandDto {
  @ApiProperty({ pattern: WAREHOUSE_CODE_PATTERN.source })
  @Transform(upperTrim)
  @Matches(WAREHOUSE_CODE_PATTERN)
  code: string;

  @ApiProperty({ minLength: 3, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID_PATTERN)
  responsibleUserId?: string;
}

export class ImportInventoryItemRowDto {
  @ApiProperty({ pattern: SKU_PATTERN.source })
  @Transform(upperTrim)
  @Matches(SKU_PATTERN)
  sku: string;

  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ minLength: 1, maxLength: 40, example: 'UNIDAD' })
  @Transform(upperTrim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  unit: string;

  @ApiProperty({ enum: INVENTORY_TRACKING_MODES })
  @Transform(upperTrim)
  @IsIn(INVENTORY_TRACKING_MODES)
  trackingMode: InventoryTrackingModeValue;

  @ApiProperty({ minimum: 0, maximum: 1_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minimumStock: number;
}

export class ImportInventoryItemsDto extends InventoryIdempotentCommandDto {
  @ApiProperty({ type: [ImportInventoryItemRowDto], maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportInventoryItemRowDto)
  items: ImportInventoryItemRowDto[];
}

export class ReceiveInventoryStockDto extends InventoryIdempotentCommandDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID_PATTERN)
  warehouseId: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID_PATTERN)
  itemId: string;

  @ApiProperty({ minimum: 1, maximum: 1_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(optionalUpperTrim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lotNumber?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @Transform(optionalUpperTrim)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  serialNumber?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @Transform(optionalTrim)
  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID_PATTERN)
  responsibleUserId?: string;

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;

  @ApiProperty({ minLength: 20, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  custodyDeclaration: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  occurredAt: string;
}

export class DispatchInventoryLineDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID_PATTERN)
  stockBalanceId: string;

  @ApiProperty({ minimum: 1, maximum: 1_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;
}

export class DispatchInventoryDto extends InventoryIdempotentCommandDto {
  @ApiProperty({ pattern: DISPATCH_CODE_PATTERN.source })
  @Transform(upperTrim)
  @Matches(DISPATCH_CODE_PATTERN)
  code: string;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID_PATTERN)
  sourceWarehouseId: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID_PATTERN)
  destinationWarehouseId?: string;

  @ApiPropertyOptional({
    description: 'PoliticalDivision PUESTO tenant-scoped',
  })
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID_PATTERN)
  destinationDivisionId?: string;

  @ApiProperty({ minLength: 3, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  destinationLabel: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10_000 })
  @ValidateIf((dto: DispatchInventoryDto) => Boolean(dto.destinationDivisionId))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  destinationTableNumber?: number;

  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID_PATTERN)
  custodianUserId: string;

  @ApiProperty({ minLength: 20, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  purpose: string;

  @ApiProperty({ minLength: 20, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  custodyDeclaration: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  occurredAt: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @Transform(optionalTrim)
  @IsOptional()
  @IsDateString({ strict: true })
  expectedReturnAt?: string;

  @ApiProperty({ type: [DispatchInventoryLineDto], maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DispatchInventoryLineDto)
  lines: DispatchInventoryLineDto[];
}

export class ReceiveInventoryTransferLineDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID_PATTERN)
  lineId: string;

  @ApiProperty({ minimum: 0, maximum: 1_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  usableQuantity: number;

  @ApiProperty({ minimum: 0, maximum: 1_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  damagedQuantity: number;

  @ApiProperty({ minimum: 0, maximum: 1_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  missingQuantity: number;
}

export class ReceiveInventoryTransferDto extends InventoryIdempotentCommandDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  expectedTransferUpdatedAt: string;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  custodyDeclaration: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  occurredAt: string;

  @ApiProperty({ type: [ReceiveInventoryTransferLineDto], maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReceiveInventoryTransferLineDto)
  lines: ReceiveInventoryTransferLineDto[];
}

export class ReturnInventoryTransferLineDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID_PATTERN)
  lineId: string;

  @ApiProperty({ minimum: 1, maximum: 1_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;
}

export class ReturnInventoryTransferDto extends InventoryIdempotentCommandDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  expectedTransferUpdatedAt: string;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  custodyDeclaration: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  occurredAt: string;

  @ApiProperty({ type: [ReturnInventoryTransferLineDto], maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReturnInventoryTransferLineDto)
  lines: ReturnInventoryTransferLineDto[];
}

export class ReconcileInventoryTransferLineDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID_PATTERN)
  lineId: string;

  @ApiProperty({ minimum: 0, maximum: 1_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  consumedQuantity: number;

  @ApiProperty({ minimum: 0, maximum: 1_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  missingQuantity: number;

  @ApiProperty({ minimum: 0, maximum: 1_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  damagedQuantity: number;
}

export class ReconcileInventoryTransferDto extends InventoryIdempotentCommandDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  expectedTransferUpdatedAt: string;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  reconciliationNote: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  occurredAt: string;

  @ApiProperty({ type: [ReconcileInventoryTransferLineDto], maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReconcileInventoryTransferLineDto)
  lines: ReconcileInventoryTransferLineDto[];
}

export class ReportInventoryIncidentDto extends InventoryIdempotentCommandDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  expectedTransferUpdatedAt: string;

  @ApiPropertyOptional()
  @Transform(optionalTrim)
  @IsOptional()
  @Matches(SAFE_ID_PATTERN)
  lineId?: string;

  @ApiProperty({ enum: INVENTORY_INCIDENT_TYPES })
  @Transform(upperTrim)
  @IsIn(INVENTORY_INCIDENT_TYPES)
  type: InventoryIncidentTypeValue;

  @ApiPropertyOptional({ minimum: 1, maximum: 1_000_000 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity?: number;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ format: 'uri', maxLength: 2048 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  evidenceReference?: string;

  @ApiPropertyOptional({ pattern: SHA256_PATTERN.source })
  @Transform(lowerTrim)
  @IsOptional()
  @Matches(SHA256_PATTERN)
  evidenceSha256?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Transform(trim)
  @IsDateString({ strict: true })
  occurredAt: string;
}
