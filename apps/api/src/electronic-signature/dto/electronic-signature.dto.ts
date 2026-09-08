import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { StorageModuleName } from '../../storage/storage.constants';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export class SignatureResourceDto {
  @IsIn([StorageModuleName.FINANCE, StorageModuleName.E14])
  module: StorageModuleName;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(SAFE_ID)
  resourceId: string;
}

export class SignDocumentDto extends SignatureResourceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(SAFE_ID)
  documentId: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código OTP debe tener seis dígitos' })
  otpCode: string;
}

export class SignatureParamsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(SAFE_ID)
  id: string;
}

export class VerifySignatureQueryDto extends SignatureResourceDto {}
