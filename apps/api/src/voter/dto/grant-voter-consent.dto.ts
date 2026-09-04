import { Transform, type TransformFnParams } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ConsentCollectionChannel } from '../../../prisma/generated/prisma';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class GrantVoterConsentDto {
  @ApiProperty({
    example: true,
    description: 'Confirmacion de una nueva autorizacion expresa del titular',
  })
  @Equals(true, {
    message: 'Debe confirmar la nueva autorizacion expresa para continuar',
  })
  consentAccepted: true;

  @ApiProperty({ example: '2026-09-v1' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u, {
    message: 'La version del aviso no tiene un formato valido',
  })
  termsVersion: string;

  @ApiProperty({ enum: ConsentCollectionChannel, example: 'IN_PERSON' })
  @IsIn([
    ConsentCollectionChannel.WEB_FORM,
    ConsentCollectionChannel.PAPER,
    ConsentCollectionChannel.PHONE,
    ConsentCollectionChannel.IN_PERSON,
  ])
  collectionChannel: ConsentCollectionChannel;
}
