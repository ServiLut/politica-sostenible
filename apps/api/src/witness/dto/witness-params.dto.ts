import { Transform, type TransformFnParams } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { PRISMA_CUID_PATTERN } from '../../common/dto/cuid-id-params.dto';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class WitnessReportParamsDto {
  @Transform(trim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  id: string;
}

export class PollingPlaceParamsDto {
  @Transform(trim)
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  puestoId: string;
}
