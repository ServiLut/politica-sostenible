import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, MaxLength } from 'class-validator';
import { Role } from '../../../prisma/generated/prisma';

export class CreateTeamInvitationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo electronico no es valido' })
  @MaxLength(254)
  email: string;

  @IsEnum(Role, { message: 'El rol solicitado no es valido' })
  role: Role;
}
