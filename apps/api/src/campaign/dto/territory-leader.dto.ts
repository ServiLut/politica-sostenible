import { IsString, IsOptional, MaxLength, IsUrl, IsEmail, IsPhoneNumber } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTerritoryLeaderDto {
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  name: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  roleDescription: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  socialNetworkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  politicalAffinity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;
}

import { PartialType } from '@nestjs/swagger';

export class UpdateTerritoryLeaderDto extends PartialType(CreateTerritoryLeaderDto) {}
