import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdatePollingPlaceProfileDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99_999)
  expectedTables: number;
}
