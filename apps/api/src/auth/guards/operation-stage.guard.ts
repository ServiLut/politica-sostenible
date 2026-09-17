import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PoliticalOperationStage } from '../../../prisma/generated/prisma';
import {
  OPERATION_STAGE_POLICY_KEY,
  type OperationStagePolicy,
} from '../decorators/operation-stage-policy.decorator';
import type { AuthenticatedRequest } from '../interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Request-boundary stage policy. This prevents mutations whose authorization
 * begins after CLOSED, but it is not a linearizable database fence: domain
 * transactions must eventually lock/revalidate the operation stage alongside
 * their write to eliminate the close-vs-mutation TOCTOU window.
 */
@Injectable()
export class OperationStageGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<OperationStagePolicy>(
      OPERATION_STAGE_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy || policy.kind === 'ALLOW_CLOSED') return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_HTTP_METHODS.has(request.method.toUpperCase())) return true;

    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException(
        'Se requiere una sesion autenticada para validar la etapa operativa',
      );
    }

    const profile = await this.prisma.operationProfile.findUnique({
      where: { tenantId },
      select: { stage: true },
    });

    if (policy.kind === 'BLOCK_CLOSED') {
      if (profile?.stage !== PoliticalOperationStage.CLOSED) return true;
      throw new ConflictException({
        code: 'OPERATION_CLOSED',
        message:
          'La operacion esta cerrada y conserva sus registros operativos en modo de solo lectura',
        currentStage: profile.stage,
      });
    }

    if (!profile) {
      throw new ConflictException({
        code: 'OPERATION_STAGE_NOT_CONFIGURED',
        message:
          'Configura o adopta la etapa vigente antes de usar la operacion electoral',
        currentStage: null,
        allowedStages: policy.allowedStages,
      });
    }

    if (!policy.allowedStages.includes(profile.stage)) {
      throw new ConflictException({
        code: 'OPERATION_STAGE_NOT_ALLOWED',
        message: `La operacion electoral no esta habilitada durante ${profile.stage}`,
        currentStage: profile.stage,
        allowedStages: policy.allowedStages,
      });
    }

    return true;
  }
}
