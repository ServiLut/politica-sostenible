import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CommunicationChannel } from '../../../prisma/generated/prisma';

export class CreateCommunicationApprovalDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(180)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @IsEnum(CommunicationChannel)
  channel: CommunicationChannel;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  purpose: string;

  @IsOptional()
  @IsBoolean()
  containsSensitiveData?: boolean = false;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueCaseId?: string;
}
