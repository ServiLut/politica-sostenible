import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TaskStatus, WorkPriority } from '../../../prisma/generated/prisma';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(WorkPriority)
  priority?: WorkPriority;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  assigneeId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueCaseId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  commitmentId?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}
