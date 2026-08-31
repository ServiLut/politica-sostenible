import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CommunicationChannel,
  InteractionDirection,
  InteractionSentiment,
} from '../../../prisma/generated/prisma';

export class CreateInteractionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueCaseId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  voterId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  externalContactRef?: string;

  @IsEnum(CommunicationChannel)
  channel: CommunicationChannel;

  @IsEnum(InteractionDirection)
  direction: InteractionDirection;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  summary: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  outcome?: string;

  @IsOptional()
  @IsEnum(InteractionSentiment)
  sentiment?: InteractionSentiment;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
