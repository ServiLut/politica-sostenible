import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/** Normal case creation uses CUID1; offline incident sync persists UUIDv4. */
export class IssueCaseIdParamsDto {
  @ApiProperty({
    description: 'Identificador CUID o UUIDv4 canonico del caso',
    example: 'ckl0z7u4f0000qzrmn831i7rn',
  })
  @IsString()
  @Matches(
    /^(?:c[a-z0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/,
    { message: 'El identificador del caso no es un CUID o UUIDv4 valido' },
  )
  id: string;
}
