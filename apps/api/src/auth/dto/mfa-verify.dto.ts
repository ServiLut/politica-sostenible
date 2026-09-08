import { IsString, Matches } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'El código debe tener exactamente 6 dígitos',
  })
  code: string;
}
