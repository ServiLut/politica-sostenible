import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ListVotersQueryDto } from './list-voters-query.dto';

export class SearchVotersDto extends ListVotersQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search!: string;
}
