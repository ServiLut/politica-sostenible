import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AiChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt: string;
}
