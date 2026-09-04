import { IsString, Length, Matches } from 'class-validator';

export class VoterDataRightsParamsDto {
  @IsString()
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'El identificador del ciudadano no es valido',
  })
  id: string;
}
