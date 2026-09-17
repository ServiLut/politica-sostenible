import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Role } from '../../../prisma/generated/prisma';
import { PRISMA_CUID_PATTERN } from '../../common/dto/cuid-id-params.dto';

export class TeamMemberParamsDto {
  @IsString()
  @Matches(PRISMA_CUID_PATTERN, {
    message: 'El identificador del miembro no es un CUID valido',
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
  @Matches(PRISMA_CUID_PATTERN, {
    message: 'El identificador territorial no es un CUID valido',
  })
  divisionId?: string | null;
}
