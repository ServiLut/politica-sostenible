import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class StoredObjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  objectPath: string;
}
