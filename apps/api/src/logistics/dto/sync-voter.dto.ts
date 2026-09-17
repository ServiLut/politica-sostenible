import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ConsentCollectionChannel } from '../../../prisma/generated/prisma';
import {
  CANONICAL_PHONE_PATTERN,
  normalizePhoneInput,
} from '../../common/utils/phone-normalization.util';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SyncVoterDto {
  @Transform(trim)
  @IsUUID('all')
  clientOperationId: string;

  @Transform(trim)
  @IsISO8601({ strict: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/,
    { message: 'capturedAt debe incluir fecha, hora y zona horaria' },
  )
  capturedAt: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^[\p{L}\p{N}.-]+$/u)
  documentId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => normalizePhoneInput(value))
  @IsString()
  @MaxLength(16)
  @Matches(CANONICAL_PHONE_PATTERN)
  phone?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  puestoId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99_999)
  mesa?: number;

  @Equals(true, {
    message: 'Debe aceptar el tratamiento de datos para sincronizar',
  })
  consentAccepted: true;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u, {
    message: 'La version del aviso no tiene un formato valido',
  })
  termsVersion: string;

  @IsIn([
    ConsentCollectionChannel.WEB_FORM,
    ConsentCollectionChannel.PAPER,
    ConsentCollectionChannel.PHONE,
    ConsentCollectionChannel.IN_PERSON,
  ])
  collectionChannel: ConsentCollectionChannel;
}
