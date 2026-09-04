import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ConsentCollectionChannel } from '../../../prisma/generated/prisma';

export class GrantCaseConsentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueCaseId: string;

  @IsEnum(ConsentCollectionChannel)
  collectionChannel: ConsentCollectionChannel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u, {
    message: 'La version del aviso no tiene un formato valido',
  })
  noticeVersion: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
