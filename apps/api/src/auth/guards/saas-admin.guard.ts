import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../interfaces/authenticated-user.interface';

// User.id actualmente usa Prisma cuid(); UUID queda admitido para una futura
// migración sin volver a identidades mutables como el correo.
const IMMUTABLE_USER_ID_PATTERN =
  /^(?:c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;
const MAX_SAAS_ADMINS = 32;

export const SAAS_ADMIN_IDENTITY_CONFIG = Symbol('SAAS_ADMIN_IDENTITY_CONFIG');

export interface SaasAdminIdentityConfig {
  readonly userIds: readonly string[];
}

export function isConfiguredSaasAdminUserId(
  userId: unknown,
  identityConfig: SaasAdminIdentityConfig,
): userId is string {
  if (typeof userId !== 'string') return false;

  const normalizedUserId = userId.toLowerCase();
  return (
    IMMUTABLE_USER_ID_PATTERN.test(normalizedUserId) &&
    identityConfig.userIds.includes(normalizedUserId)
  );
}

export class SaasAdminConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaasAdminConfigurationError';
  }
}

export function loadSaasAdminIdentityConfig(
  environment: NodeJS.ProcessEnv = process.env,
): SaasAdminIdentityConfig {
  if (environment.SAAS_ADMIN_EMAILS?.trim()) {
    throw new SaasAdminConfigurationError(
      'SAAS_ADMIN_EMAILS ya no es compatible; el privilegio SaaS debe asignarse exclusivamente por ID inmutable.',
    );
  }

  const serializedUserIds = environment.SAAS_ADMIN_USER_IDS?.trim();
  if (!serializedUserIds) {
    throw new SaasAdminConfigurationError(
      'SAAS_ADMIN_USER_IDS es obligatorio.',
    );
  }

  const candidates = serializedUserIds.split(',');
  if (candidates.length > MAX_SAAS_ADMINS) {
    throw new SaasAdminConfigurationError(
      `SAAS_ADMIN_USER_IDS no puede contener más de ${MAX_SAAS_ADMINS} usuarios.`,
    );
  }

  const userIds = candidates.map((candidate) => {
    const userId = candidate.trim().toLowerCase();
    if (!IMMUTABLE_USER_ID_PATTERN.test(userId)) {
      throw new SaasAdminConfigurationError(
        'SAAS_ADMIN_USER_IDS debe contener únicamente CUIDs o UUIDs canónicos separados por coma.',
      );
    }
    return userId;
  });

  if (new Set(userIds).size !== userIds.length) {
    throw new SaasAdminConfigurationError(
      'SAAS_ADMIN_USER_IDS no puede contener identificadores duplicados.',
    );
  }

  return Object.freeze({ userIds: Object.freeze(userIds) });
}

@Injectable()
export class SaasAdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SAAS_ADMIN_IDENTITY_CONFIG)
    private readonly identityConfig: SaasAdminIdentityConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.userId;
    const tenantId = request.user?.tenantId;
    const normalizedUserId = userId?.toLowerCase();

    if (
      !tenantId ||
      !normalizedUserId ||
      !isConfiguredSaasAdminUserId(userId, this.identityConfig)
    ) {
      return false;
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: {
        id: true,
        isActive: true,
        totpSecret: true,
        totpEnabledAt: true,
      },
    });

    return Boolean(
      currentUser?.isActive &&
      currentUser.totpSecret &&
      currentUser.totpEnabledAt &&
      currentUser.id.toLowerCase() === normalizedUserId,
    );
  }
}
