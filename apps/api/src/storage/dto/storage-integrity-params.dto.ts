import { IsString, Matches } from 'class-validator';

export class StorageIntegrityParamsDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,128}$/u)
  objectId: string;
}
