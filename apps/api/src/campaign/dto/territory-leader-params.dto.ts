import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { PRISMA_CUID_PATTERN } from '../../common/dto/cuid-id-params.dto';

export class TerritoryLeaderDivisionParamsDto {
  @ApiProperty({ description: 'CUID de la división territorial' })
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  divisionId: string;
}

export class TerritoryLeaderParamsDto extends TerritoryLeaderDivisionParamsDto {
  @ApiProperty({ description: 'CUID del líder territorial' })
  @IsString()
  @Matches(PRISMA_CUID_PATTERN)
  leaderId: string;
}
