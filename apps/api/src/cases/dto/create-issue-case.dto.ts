import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CommunicationChannel,
  WorkPriority,
} from '../../../prisma/generated/prisma';

export class CreateIssueCaseDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]{2,49}$/)
  reference?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @IsEnum(CommunicationChannel)
  sourceChannel: CommunicationChannel;

  @IsOptional()
  @IsEnum(WorkPriority)
  priority?: WorkPriority;

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

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  divisionId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  assigneeId?: string;

  @IsOptional()
  @IsBoolean()
  confidential?: boolean;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
