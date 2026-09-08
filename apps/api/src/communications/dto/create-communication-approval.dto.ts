import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CommunicationChannel } from '../../../prisma/generated/prisma';

export const COMMUNICATION_RECIPIENT_BASES = [
  'DIRECT_OPT_IN',
  'PARTY_MEMBERSHIP',
  'CASE_RESPONSE',
  'PUBLIC_AUDIENCE',
  'INTERNAL',
] as const;

export type CommunicationRecipientBasis =
  (typeof COMMUNICATION_RECIPIENT_BASES)[number];

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

  @IsIn(COMMUNICATION_RECIPIENT_BASES)
  recipientBasis: CommunicationRecipientBasis;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  audienceDescription: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  dataSource: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  segmentationCriteria: string;

  @IsBoolean()
  usesArtificialIntelligence: boolean;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  rightsMechanismUrl?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(180)
  consentEvidenceReference?: string;

  @IsOptional()
  @IsBoolean()
  containsSensitiveData?: boolean = false;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueCaseId?: string;
}
