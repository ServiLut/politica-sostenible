import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMimeType,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  IsOptional,
  Matches,
} from 'class-validator';
import {
  STORAGE_MAX_FILE_NAME_LENGTH,
  STORAGE_MAX_UPLOAD_BYTES,
  StorageModuleName,
} from '../storage.constants';
import {
  DocumentCategory,
  RetentionPhase,
} from '../../../prisma/generated/prisma';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUploadUrlDto {
  @IsEnum(StorageModuleName)
  module: StorageModuleName;

  @IsString()
  @IsNotEmpty()
  @MaxLength(STORAGE_MAX_FILE_NAME_LENGTH)
  fileName: string;

  @IsString()
  @IsMimeType()
  @MaxLength(150)
  contentType: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STORAGE_MAX_UPLOAD_BYTES)
  size: number;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[0-9a-f]{64}$/, {
    message: 'contentSha256 debe ser una huella SHA-256 hexadecimal',
  })
  contentSha256?: string;

  @IsEnum(DocumentCategory)
  @IsOptional()
  documentCategory?: DocumentCategory;

  @IsEnum(RetentionPhase)
  @IsOptional()
  retentionPhase?: RetentionPhase;
}
