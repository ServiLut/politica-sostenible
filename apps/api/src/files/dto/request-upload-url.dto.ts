import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class RequestUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-_]+$/i, {
    message: 'module debe contener solo letras, números, guion o guion bajo',
  })
  module: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contentType: string;
}
