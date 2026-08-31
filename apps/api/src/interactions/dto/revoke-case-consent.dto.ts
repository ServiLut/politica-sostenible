import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RevokeCaseConsentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueCaseId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
