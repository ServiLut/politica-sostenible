import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CommunicationChannel,
  IssueCaseStatus,
  WorkPriority,
} from '../../../prisma/generated/prisma';

export class UpdateIssueCaseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsEnum(CommunicationChannel)
  sourceChannel?: CommunicationChannel;

  @IsOptional()
  @IsEnum(IssueCaseStatus)
  status?: IssueCaseStatus;

  @IsOptional()
  @IsEnum(WorkPriority)
  priority?: WorkPriority;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  voterId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  externalContactRef?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  divisionId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  assigneeId?: string | null;

  @IsOptional()
  @IsBoolean()
  confidential?: boolean;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}
