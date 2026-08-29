import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Role } from '../../../prisma/generated/prisma';

export class TeamMemberParamsDto {
  @IsString()
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'El identificador del miembro no es valido',
  })
  memberId: string;
}

export class UpdateTeamMemberRoleDto {
  @IsEnum(Role, { message: 'El rol solicitado no es valido' })
  role: Role;
}

export class UpdateTeamMemberStatusDto {
  @IsBoolean({ message: 'El estado de la cuenta debe ser booleano' })
  isActive: boolean;
}

export class UpdateTeamMemberDivisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'El identificador territorial no es valido',
  })
  divisionId?: string | null;
}
