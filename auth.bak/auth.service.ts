import {
  Injectable,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private supabase: { auth: SupabaseClient['auth'] };

  constructor(private prisma: PrismaService) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_ANON_KEY ?? process.env.SERVICE_ROLE;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase configuration: SUPABASE_URL or SUPABASE_ANON_KEY/SERVICE_ROLE is not set.',
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey) as unknown as {
      auth: SupabaseClient['auth'];
    };
  }

  async register(registerDto: RegisterDto, ip?: string) {
    const { email, password, acceptTerms } = registerDto;

    // 1. Intentar registro en Supabase
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      // Manejo de errores específicos
      console.error('Supabase Auth Error:', error); // Log para debugging
      const msg = error.message.toLowerCase();

      if (msg.includes('already registered') || error.status === 422) {
        throw new ConflictException('Correo ya registrado');
      }

      if (msg.includes('password') || msg.includes('weak')) {
        throw new BadRequestException('Contraseña demasiado débil');
      }

      throw new BadRequestException(error.message);
    }

    if (!data.user) {
      throw new InternalServerErrorException(
        'No se pudo obtener el usuario de Supabase',
      );
    }

    const user = data.user;

    // 2. Guardar en PostgreSQL (Prisma)
    // Verificamos si ya existe el usuario para evitar error 500 feo
    const existingUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (existingUser) {
      throw new ConflictException('Usuario ya registrado en el sistema local');
    }

    try {
      // Usamos una transacción para asegurar que ambos se creen
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: user.id,
            email: user.email!,
            role: 'CUSTOMER',
          },
        });

        await tx.profile.create({
          data: {
            email: user.email!,
            userId: user.id,
            metadata: {
              termsAccepted: acceptTerms,
              termsAcceptedAt: new Date().toISOString(),
              registrationIp: ip,
            },
          },
        });
      });
    } catch (error: unknown) {
      // Rollback idealmente, pero sin service_role no podemos borrar el user de supabase fácilmente.
      console.error('Error creating user/profile:', error);
      throw new InternalServerErrorException(
        'Error al crear el perfil de usuario',
      );
    }

    // 3. Respuesta estructurada
    // Si session es null, suele indicar que se requiere confirmación de correo
    const requiresEmailVerification = !data.session;

    return {
      message: requiresEmailVerification
        ? 'Registro iniciado. Por favor verifica tu correo electrónico.'
        : 'Registro exitoso.',
      user: {
        id: user.id,
        email: user.email,
      },
      requiresEmailVerification,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      throw new BadRequestException('Credenciales inválidas');
    }

    const user = data.user;

    let userInDb = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { profile: true },
    });

    // Auto-healing: If user exists in Auth but not in our DB, create it.
    if (!userInDb && user) {
      try {
        console.log(`Creating missing user/profile for user ${user.email}`);
        userInDb = await this.prisma.user.create({
          data: {
            id: user.id,
            email: user.email!,
            role: 'CUSTOMER',
            profile: {
              create: {
                email: user.email!,
              },
            },
          },
          include: { profile: true },
        });
      } catch (err) {
        console.error('Failed to auto-create user/profile on login', err);
      }
    } else if (userInDb && !userInDb.profile) {
      // User exists but profile doesn't (rare)
      try {
        await this.prisma.profile.create({
          data: {
            email: userInDb.email,
            userId: userInDb.id,
          },
        });
      } catch (err) {
        console.error(
          'Failed to auto-create profile for existing user on login',
          err,
        );
      }
    }

    return {
      message: 'Inicio de sesión exitoso',
      user: data.user,
      session: data.session,
      role: userInDb?.role || 'CUSTOMER',
    };
  }

  async forgotPassword(email: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password`,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      message: 'Correo de recuperación enviado con éxito',
    };
  }
}
