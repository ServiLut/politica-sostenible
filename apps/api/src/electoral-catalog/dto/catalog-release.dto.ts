import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ElectoralCatalogStatus,
  ElectoralCatalogType,
} from '../../../prisma/generated/prisma';

const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CatalogReleaseIdParamsDto {
  @ApiProperty({ description: 'Identificador interno del release' })
  @Transform(trim)
  @IsString()
  @Matches(SAFE_IDENTIFIER)
  id: string;
}

export class ListCatalogReleasesQueryDto {
  @ApiPropertyOptional({ enum: ElectoralCatalogType })
  @IsOptional()
  @IsEnum(ElectoralCatalogType)
  type?: ElectoralCatalogType;

  @ApiPropertyOptional({ enum: ElectoralCatalogStatus })
  @IsOptional()
  @IsEnum(ElectoralCatalogStatus)
  status?: ElectoralCatalogStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}

export class CatalogReleaseDetailQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  entryLimit = 200;

  @ApiPropertyOptional({ description: 'Cursor opaco de entrada' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(SAFE_IDENTIFIER)
  entryCursorId?: string;
}

export class CatalogReleaseDiffQueryDto {
  @ApiPropertyOptional({
    description:
      'Release base; si se omite se usa el release activo o reemplazado anterior del mismo catalogo',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(SAFE_IDENTIFIER)
  againstReleaseId?: string;
}

export class CatalogReleaseIntegrityDto {
  @ApiProperty({
    description: 'SHA-256 mostrado al revisar el release',
    pattern: SHA256.source,
  })
  @Transform(trim)
  @IsString()
  @Matches(SHA256)
  expectedContentSha256: string;
}
