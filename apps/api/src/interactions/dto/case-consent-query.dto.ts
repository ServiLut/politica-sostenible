import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CaseConsentQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueCaseId: string;
}
