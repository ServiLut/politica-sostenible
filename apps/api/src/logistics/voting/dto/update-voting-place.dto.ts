import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateVotingPlaceDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalMesas?: number;

  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  direccion?: string;
}
