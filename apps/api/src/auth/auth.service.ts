import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import {
  AuditActorType,
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

// Mantiene un costo de bcrypt equivalente cuando el correo no existe y reduce
// la utilidad de las diferencias de tiempo para enumerar cuentas.
const DUMMY_PASSWORD_HASH =
  '$2b$12$wlL6bomTWf5lMYG4AC2UmezhPHN3i2fH5RFtgvsnHe2vG/wUoHAhq';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const { email, password } = dto;
    this.assertBcryptPasswordSize(password);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        name: true,
        role: true,
        isActive: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            defaultMode: true,
          },
        },
      },
    });

    const passwordMatches = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenant: user.tenant,
      },
    };
  }

  async register(dto: RegisterDto) {
    const {
      email,
      password,
      name,
      documentId,
      phone,
      organizationName,
      organizationType,
      termsVersion,
    } = dto;
    this.assertBcryptPasswordSize(password);

    const [existingUser, hashedPassword] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }),
      bcrypt.hash(password, 12),
    ]);

    if (existingUser) {
      throw new ConflictException(
        'No fue posible crear la cuenta con esos identificadores',
      );
    }
    const normalizedName = name.trim();
    const normalizedOrganizationName = organizationName.trim();
    const defaultMode =
      organizationType === TenantType.PUBLIC_OFFICE
        ? PoliticalOperationMode.PUBLIC_OFFICE
        : PoliticalOperationMode.CAMPAIGN;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const slugStem = normalizedOrganizationName
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60);
        const slug = `${slugStem || 'organizacion'}-${randomUUID().slice(0, 8)}`;
        const tenant = await tx.tenant.create({
          data: {
            name: normalizedOrganizationName,
            slug,
            type: organizationType,
            defaultMode,
          },
        });

        const user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name: normalizedName,
            documentId: documentId.trim(),
            phone: phone?.trim(),
            tenantId: tenant.id,
            role: Role.ADMIN,
          },
        });

        await tx.auditEvent.create({
          data: {
            tenantId: tenant.id,
            mode: defaultMode,
            actorType: AuditActorType.USER,
            actorUserId: user.id,
            action: 'ACCOUNT_TERMS_ACCEPTED',
            resourceType: 'User',
            resourceId: user.id,
            metadata: {
              termsVersion,
              organizationType,
            },
          },
        });

        return {
          message: 'Usuario y organización registrados exitosamente',
          userId: user.id,
          tenantId: tenant.id,
        };
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'No fue posible crear la cuenta con esos identificadores',
        );
      }
      this.logger.error('Registration transaction failed');
      throw new InternalServerErrorException('Error al registrar el usuario');
    }
  }

  async currentSession(user: AuthenticatedUser) {
    const currentUser = await this.prisma.user.findFirst({
      where: {
        id: user.userId,
        tenantId: user.tenantId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            defaultMode: true,
          },
        },
      },
    });

    if (!currentUser) {
      throw new UnauthorizedException('Sesion invalida o desactivada');
    }

    return { user: currentUser };
  }

  private assertBcryptPasswordSize(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException(
        'La contraseña no puede superar 72 bytes en UTF-8',
      );
    }
  }
}
