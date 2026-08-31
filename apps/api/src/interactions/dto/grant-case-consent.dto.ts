import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
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

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
