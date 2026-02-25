import { IsNumber, IsPositive, Min } from 'class-validator';

export class UpdateTableDto {
  @IsNumber()
  @IsPositive()
  mesaNumero: number;

  @IsNumber()
  @Min(0)
  votosCandidato: number;

  @IsNumber()
  @Min(0)
  votosBlanco: number;

  @IsNumber()
  @Min(0)
  votosTotales: number;
}
