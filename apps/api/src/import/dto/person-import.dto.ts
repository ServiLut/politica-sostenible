import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePersonImportDto {
  @IsUUID('4')
  clientRequestId: string;

  @IsString()
  @MaxLength(180)
  @Matches(/^[\p{L}\p{N} _.()+-]+\.csv$/iu)
  fileName: string;

  @IsString()
  @MaxLength(512)
  @Matches(/^[a-z0-9]+\/person-import\/[0-9a-f-]{36}\.csv$/u)
  sourceArtifactPath: string;

  @Matches(/^[0-9a-f]{64}$/u)
  expectedContentSha256: string;
}

export class PersonImportIdDto {
  @Matches(/^c[a-z0-9]{24}$/u)
  id: string;
}

export class PersonImportPageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
