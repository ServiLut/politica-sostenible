import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/**
 * Prisma `cuid()` currently persists canonical, lowercase CUID1 identifiers.
 * Route parameters must match that storage contract instead of accepting any
 * arbitrary string that would reach a tenant-scoped lookup.
 */
export const PRISMA_CUID_PATTERN = /^c[a-z0-9]{24}$/;

export class CuidIdParamsDto {
  @ApiProperty({
    description: 'Identificador CUID canonico del recurso',
    example: 'ckl0z7u4f0000qzrmn831i7rn',
  })
  @IsString()
  @Matches(PRISMA_CUID_PATTERN, {
    message: 'El identificador del recurso no es un CUID valido',
  })
  id: string;
}
