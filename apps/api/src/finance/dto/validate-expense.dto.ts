import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ValidateExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;
}
