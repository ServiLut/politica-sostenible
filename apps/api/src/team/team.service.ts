import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  AuditActorType,
  DivisionType,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptTeamInvitationDto } from './dto/accept-team-invitation.dto';
import { CreateTeamInvitationDto } from './dto/create-team-invitation.dto';
import { ListTeamQueryDto } from './dto/list-team-query.dto';
import {
  UpdateTeamMemberDivisionDto,
  UpdateTeamMemberRoleDto,
  UpdateTeamMemberStatusDto,
} from './dto/team-member-lifecycle.dto';

const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1_000;

const CAMPAIGN_ROLES = new Set<Role>([
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMMUNICATIONS_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
  Role.VOLUNTEER,
]);

const PUBLIC_OFFICE_ROLES = new Set<Role>([
  Role.COMMUNICATIONS_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
]);

const TERRITORIAL_ROLE_TYPES: Readonly<Partial<Record<Role, DivisionType[]>>> =
  {
    [Role.ZONE_COORDINATOR]: [DivisionType.MUNICIPIO, DivisionType.ZONA],
    [Role.WITNESS]: [DivisionType.PUESTO],
    [Role.VOLUNTEER]: [
      DivisionType.MUNICIPIO,
      DivisionType.ZONA,
      DivisionType.PUESTO,
    ],
  };

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listMembers(user: AuthenticatedUser, query: ListTeamQueryDto) {
    await this.assertCurrentAdmin(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.UserWhereInput = {
      tenantId: user.tenantId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          divisionId: true,
          division: {
            select: { id: true, code: true, name: true, type: true },
          },
          createdAt: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return this.paginated(items, page, limit, total);
  }

  async updateMemberRole(
    user: AuthenticatedUser,
    memberId: string,
    dto: UpdateTeamMemberRoleDto,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const mode = await this.assertCurrentAdmin(user, tx);
          this.assertAssignableRole(dto.role, mode);
          const target = await this.findMutableMember(user, memberId, tx);

          if (target.role === dto.role) {
            return target;
          }

          const updated = await tx.user.updateMany({
            where: {
              id: target.id,
              tenantId: user.tenantId,
              role: target.role,
              isActive: target.isActive,
            },
            // Role changes invalidate the old territorial grant. An admin must
            // explicitly assign a compatible scope for the new role.
            data: { role: dto.role, divisionId: null },
          });
          if (updated.count !== 1) {
            throw this.concurrentTeamChange();
          }

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'TEAM_MEMBER_ROLE_CHANGED',
              resourceType: 'User',
              resourceId: target.id,
              before: { role: target.role },
              after: { role: dto.role },
            },
          });

          return {
            ...target,
            role: dto.role,
            divisionId: null,
            division: null,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2034')) {
        throw this.concurrentTeamChange();
      }
      throw error;
    }
  }

  async updateMemberStatus(
    user: AuthenticatedUser,
    memberId: string,
    dto: UpdateTeamMemberStatusDto,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const mode = await this.assertCurrentAdmin(user, tx);
          const target = await this.findMutableMember(user, memberId, tx);

          if (target.isActive === dto.isActive) {
            return target;
          }

          const updated = await tx.user.updateMany({
            where: {
              id: target.id,
              tenantId: user.tenantId,
              role: target.role,
              isActive: target.isActive,
            },
            data: { isActive: dto.isActive },
          });
          if (updated.count !== 1) {
            throw this.concurrentTeamChange();
          }

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: dto.isActive
                ? 'TEAM_MEMBER_ACTIVATED'
                : 'TEAM_MEMBER_DEACTIVATED',
              resourceType: 'User',
              resourceId: target.id,
              before: { isActive: target.isActive },
              after: { isActive: dto.isActive },
            },
          });

          return { ...target, isActive: dto.isActive };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2034')) {
        throw this.concurrentTeamChange();
      }
      throw error;
    }
  }

  async updateMemberDivision(
    user: AuthenticatedUser,
    memberId: string,
    dto: UpdateTeamMemberDivisionDto,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const mode = await this.assertCurrentAdmin(user, tx);
          if (mode !== PoliticalOperationMode.CAMPAIGN) {
            throw new BadRequestException(
              'El alcance electoral sólo se asigna en modo campaña',
            );
          }

          const target = await this.findMutableMember(user, memberId, tx);
          const divisionId = dto.divisionId ?? null;
          const allowedTypes = TERRITORIAL_ROLE_TYPES[target.role];

          if (!allowedTypes) {
            if (divisionId !== null) {
              throw new BadRequestException(
                'El rol del miembro no utiliza una asignación territorial',
              );
            }
          }

          const division = divisionId
            ? await tx.politicalDivision.findFirst({
                where: {
                  id: divisionId,
                  tenantId: user.tenantId,
                  type: { in: allowedTypes ?? [] },
                },
                select: { id: true, code: true, name: true, type: true },
              })
            : null;

          if (divisionId && !division) {
            throw new BadRequestException(
              'La división no pertenece al tenant o no es compatible con el rol',
            );
          }

          if (target.divisionId === divisionId) {
            return { ...target, division };
          }

          const updated = await tx.user.updateMany({
            where: {
              id: target.id,
              tenantId: user.tenantId,
              role: target.role,
              isActive: target.isActive,
              divisionId: target.divisionId,
            },
            data: { divisionId },
          });
          if (updated.count !== 1) throw this.concurrentTeamChange();

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'TEAM_MEMBER_DIVISION_CHANGED',
              resourceType: 'User',
              resourceId: target.id,
              before: { divisionId: target.divisionId },
              after: { divisionId },
              metadata: { role: target.role },
            },
          });

          return { ...target, divisionId, division };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2034')) {
        throw this.concurrentTeamChange();
      }
      throw error;
    }
  }

  async listPendingInvitations(
    user: AuthenticatedUser,
    query: ListTeamQueryDto,
  ) {
    await this.assertCurrentAdmin(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.TeamInvitationWhereInput = {
      tenantId: user.tenantId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
      ...(query.search
        ? { email: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.teamInvitation.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
          invitedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.teamInvitation.count({ where }),
    ]);

    return this.paginated(items, page, limit, total);
  }

  async createInvitation(
    user: AuthenticatedUser,
    dto: CreateTeamInvitationDto,
  ) {
    const appOrigin = this.resolveAppOrigin();
    const email = dto.email.trim().toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);

    try {
      const invitation = await this.prisma.$transaction(
        async (tx) => {
          const mode = await this.assertCurrentAdmin(user, tx);
          this.assertAssignableRole(dto.role, mode);

          const [existingUser, pendingInvitation] = await Promise.all([
            tx.user.findUnique({
              where: { email },
              select: { id: true },
            }),
            tx.teamInvitation.findFirst({
              where: {
                tenantId: user.tenantId,
                email,
                acceptedAt: null,
                expiresAt: { gt: new Date() },
              },
              select: { id: true },
            }),
          ]);

          if (existingUser || pendingInvitation) {
            throw new ConflictException(
              'No fue posible crear la invitación con esos datos',
            );
          }

          const created = await tx.teamInvitation.create({
            data: {
              tenantId: user.tenantId,
              email,
              role: dto.role,
              tokenHash,
              expiresAt,
              invitedById: user.userId,
            },
            select: {
              id: true,
              email: true,
              role: true,
              expiresAt: true,
              createdAt: true,
            },
          });

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'TEAM_INVITATION_CREATED',
              resourceType: 'TeamInvitation',
              resourceId: created.id,
              metadata: {
                role: created.role,
                delivery: 'MANUAL',
              },
            },
          });

          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      const invitationUrl = new URL('/aceptar-invitacion', appOrigin);
      // El fragmento no se envia en peticiones HTTP ni queda en logs del proxy.
      invitationUrl.hash = new URLSearchParams({ token }).toString();

      return {
        invitation,
        invitationUrl: invitationUrl.toString(),
        delivery: 'MANUAL' as const,
      };
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'No fue posible crear otra invitacion con esos datos',
        );
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'El equipo cambio durante la solicitud; vuelve a intentarlo',
        );
      }
      throw error;
    }
  }

  async acceptInvitation(dto: AcceptTeamInvitationDto) {
    this.assertBcryptPasswordSize(dto.password);
    const tokenHash = this.hashToken(dto.token);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const now = new Date();

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const invitation = await tx.teamInvitation.findUnique({
            where: { tokenHash },
            select: {
              id: true,
              tenantId: true,
              email: true,
              role: true,
              expiresAt: true,
              acceptedAt: true,
              tenant: { select: { defaultMode: true } },
            },
          });

          if (
            !invitation ||
            invitation.acceptedAt !== null ||
            invitation.expiresAt <= now ||
            !this.isAssignableRole(
              invitation.role,
              invitation.tenant.defaultMode,
            )
          ) {
            throw this.invalidInvitation();
          }

          const existingUser = await tx.user.findUnique({
            where: { email: invitation.email },
            select: { id: true },
          });
          if (existingUser) {
            throw this.invalidInvitation();
          }

          const accepted = await tx.teamInvitation.updateMany({
            where: {
              id: invitation.id,
              tenantId: invitation.tenantId,
              acceptedAt: null,
              expiresAt: { gt: now },
            },
            data: { acceptedAt: now },
          });
          if (accepted.count !== 1) {
            throw this.invalidInvitation();
          }

          const newUser = await tx.user.create({
            data: {
              tenantId: invitation.tenantId,
              email: invitation.email,
              password: passwordHash,
              name: dto.name.trim(),
              documentId: dto.documentId.trim(),
              phone: dto.phone?.trim(),
              role: invitation.role,
            },
            select: { id: true },
          });

          await tx.auditEvent.createMany({
            data: [
              {
                tenantId: invitation.tenantId,
                mode: invitation.tenant.defaultMode,
                actorType: AuditActorType.USER,
                actorUserId: newUser.id,
                action: 'TEAM_INVITATION_ACCEPTED',
                resourceType: 'TeamInvitation',
                resourceId: invitation.id,
                metadata: { role: invitation.role },
              },
              {
                tenantId: invitation.tenantId,
                mode: invitation.tenant.defaultMode,
                actorType: AuditActorType.USER,
                actorUserId: newUser.id,
                action: 'ACCOUNT_TERMS_ACCEPTED',
                resourceType: 'User',
                resourceId: newUser.id,
                metadata: { termsVersion: dto.termsVersion },
              },
            ],
          });

          return {
            message: 'Invitacion aceptada. Ya puedes iniciar sesion.',
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'La invitacion no pudo aceptarse con esos identificadores',
        );
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'La invitacion cambio durante la solicitud; vuelve a intentarlo',
        );
      }
      throw error;
    }
  }

  private async assertCurrentAdmin(
    user: AuthenticatedUser,
    client: Pick<PrismaService, 'user' | 'tenant'> = this.prisma,
  ): Promise<PoliticalOperationMode> {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Solo un administrador puede gestionar el equipo',
      );
    }

    const [admin, tenant] = await Promise.all([
      client.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          role: Role.ADMIN,
          isActive: true,
        },
        select: { id: true },
      }),
      client.tenant.findUnique({
        where: { id: user.tenantId },
        select: { defaultMode: true },
      }),
    ]);

    if (!admin) {
      throw new ForbiddenException(
        'Tu cuenta ya no tiene permisos para gestionar el equipo',
      );
    }
    if (!tenant) {
      throw new NotFoundException('Organizacion no encontrada');
    }

    return tenant.defaultMode;
  }

  private assertAssignableRole(role: Role, mode: PoliticalOperationMode): void {
    if (!this.isAssignableRole(role, mode)) {
      throw new BadRequestException(
        'El rol no puede asignarse en el modo operativo actual',
      );
    }
  }

  private async findMutableMember(
    user: AuthenticatedUser,
    memberId: string,
    client: Pick<PrismaService, 'user'>,
  ): Promise<{
    id: string;
    role: Role;
    isActive: boolean;
    divisionId: string | null;
  }> {
    const target = await client.user.findFirst({
      where: {
        id: memberId,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        role: true,
        isActive: true,
        divisionId: true,
      },
    });

    if (!target) {
      throw new NotFoundException('Miembro no encontrado');
    }
    if (target.id === user.userId) {
      throw new ForbiddenException('No puedes modificar tu propia cuenta');
    }
    if (target.role === Role.ADMIN) {
      throw new ForbiddenException(
        'La cuenta administradora no puede modificarse desde el equipo',
      );
    }

    return target;
  }

  private concurrentTeamChange(): ConflictException {
    return new ConflictException(
      'El miembro cambio durante la solicitud; vuelve a cargar el equipo',
    );
  }

  private isAssignableRole(role: Role, mode: PoliticalOperationMode): boolean {
    if (role === Role.ADMIN) return false;
    return mode === PoliticalOperationMode.CAMPAIGN
      ? CAMPAIGN_ROLES.has(role)
      : PUBLIC_OFFICE_ROLES.has(role);
  }

  private resolveAppOrigin(): string {
    const configured = this.config.get<string>('NEXT_PUBLIC_APP_URL')?.trim();
    if (!configured) {
      throw new InternalServerErrorException(
        'NEXT_PUBLIC_APP_URL es obligatorio para crear invitaciones',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      throw new InternalServerErrorException(
        'NEXT_PUBLIC_APP_URL no es una URL valida',
      );
    }

    const isLocalDevelopment =
      process.env.NODE_ENV !== 'production' &&
      parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (
      (parsed.protocol !== 'https:' && !isLocalDevelopment) ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname && parsed.pathname !== '/') ||
      parsed.search ||
      parsed.hash
    ) {
      throw new InternalServerErrorException(
        'NEXT_PUBLIC_APP_URL debe ser un origen HTTPS sin ruta ni credenciales',
      );
    }

    return parsed.origin;
  }

  private assertBcryptPasswordSize(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException(
        'La contrasena no puede superar 72 bytes en UTF-8',
      );
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private invalidInvitation(): BadRequestException {
    return new BadRequestException('Invitacion invalida, vencida o utilizada');
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }

  private paginated<T>(items: T[], page: number, limit: number, total: number) {
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
