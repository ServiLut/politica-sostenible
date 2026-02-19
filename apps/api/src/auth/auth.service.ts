import {
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
import { Role } from '../../prisma/generated/prisma';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const { email, password } = dto;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        tenant: true,
      },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
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
    const { email, password, name, documentId, phone } = dto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const slug = `campana-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
        const tenant = await tx.tenant.create({
          data: {
            name: `Campaña de ${name}`,
            slug,
            type: 'CANDIDACY',
          },
        });

        const user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name,
            documentId,
            phone,
            tenantId: tenant.id,
            role: Role.ADMIN,
          },
        });

        return {
          message: 'Usuario y campaña registrados exitosamente',
          userId: user.id,
          tenantId: tenant.id,
        };
      });
    } catch (error: unknown) {
      this.logger.error(
        `Error in registration: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException('Error al registrar el usuario');
    }
  }
}
