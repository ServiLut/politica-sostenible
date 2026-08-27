import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AnalyzeSentimentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  text: string;
}
