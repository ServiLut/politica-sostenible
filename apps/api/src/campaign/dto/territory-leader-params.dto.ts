import { IsString, Matches, MaxLength } from 'class-validator';

export class TerritoryDivisionParamsDto {
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9:_-]+$/)
  divisionId: string;
}

export class TerritoryLeaderParamsDto extends TerritoryDivisionParamsDto {
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  leaderId: string;
}
