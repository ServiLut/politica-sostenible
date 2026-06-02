import { IsArray, IsNumber, IsObject, IsOptional } from 'class-validator';

export class UpdateOperationsStateDto {
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  events?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  tasks?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  team?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  broadcasts?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  compliance?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  territory?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  e14Reports?: Record<string, unknown>[];

  @IsOptional()
  @IsNumber()
  campaignGoal?: number;

  @IsOptional()
  @IsObject()
  onboarding?: Record<string, unknown>;
}
