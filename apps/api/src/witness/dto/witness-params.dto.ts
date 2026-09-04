import { Transform, type TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class WitnessReportParamsDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id: string;
}

export class PollingPlaceParamsDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  puestoId: string;
}
