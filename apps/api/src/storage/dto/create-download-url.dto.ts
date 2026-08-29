import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { StorageModuleName } from '../storage.constants';

const REVIEWABLE_MODULES = [
  StorageModuleName.FINANCE,
  StorageModuleName.E14,
] as const;

export class CreateDownloadUrlDto {
  @IsIn(REVIEWABLE_MODULES, {
    message: 'El módulo no admite lectura desde este flujo',
  })
  module: (typeof REVIEWABLE_MODULES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  resourceId: string;
}
