import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ElectoralCatalogImportStatus } from '../../../prisma/generated/prisma';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const CATALOG_KEY = /^[A-Z0-9][A-Z0-9._-]{2,159}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DATE_ONLY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const STORAGE_PATH =
  /^[A-Za-z0-9_-]{1,128}\/electoral-catalog\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/iu;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateElectoralCatalogImportDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(trim)
  @IsUUID('4')
  clientRequestId: string;

  @ApiProperty({ pattern: CATALOG_KEY.source })
  @Transform(trim)
  @IsString()
  @Matches(CATALOG_KEY)
  catalogKey: string;

  @ApiProperty({ description: 'URL HTTPS oficial de Registraduria' })
  @Transform(trim)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  sourceUrl: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  sourceDataset: string;

  @ApiProperty({ format: 'date-time' })
  @Transform(trim)
  @IsISO8601({ strict: true, strictSeparator: true })
  sourceCutoffAt: string;

  @ApiProperty({ format: 'date', pattern: DATE_ONLY.source })
  @Transform(trim)
  @Matches(DATE_ONLY)
  electionDate: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  authorizationReference: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  licenseDeclaration: string;

  @ApiProperty({ pattern: STORAGE_PATH.source })
  @Transform(trim)
  @Matches(STORAGE_PATH)
  sourceArtifactPath: string;

  @ApiProperty({ pattern: SHA256.source })
  @Transform(trim)
  @Matches(SHA256)
  expectedContentSha256: string;
}

export class ElectoralCatalogImportIdParamsDto {
  @ApiProperty()
  @Transform(trim)
  @Matches(SAFE_ID)
  id: string;
}

export class ListElectoralCatalogImportsQueryDto {
  @ApiPropertyOptional({ enum: ElectoralCatalogImportStatus })
  @IsOptional()
  @IsEnum(ElectoralCatalogImportStatus)
  status?: ElectoralCatalogImportStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
