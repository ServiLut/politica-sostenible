import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class ConfirmUploadDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-_]+$/i, {
    message: 'module debe contener solo letras, números, guion o guion bajo',
  })
  module: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  path: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fileName: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  mimeType?: string;
}
