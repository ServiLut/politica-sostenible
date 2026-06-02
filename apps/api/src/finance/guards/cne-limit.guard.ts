import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CneCode, EntryType } from '../../../prisma/generated/prisma';
import { JwtIdentityService } from '../../common/services/jwt-identity.service';

@Injectable()
export class CneLimitGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private readonly jwtIdentityService: JwtIdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { amount, cneCode, type } = request.body;
    const identity = await this.jwtIdentityService.fromAuthorizationHeader(
      request.headers?.authorization,
    );
    const tenantId = identity.tenantId;

    // Solo aplicamos la lógica a los gastos (EXPENSE)
    if (type !== EntryType.EXPENSE) {
      return true;
    }

    if (!amount || !cneCode) {
      return true; // Dejar que el ValidationPipe maneje los datos faltantes
    }

    // Obtener la configuración de topes para el Tenant
    const settings = await this.prisma.campaignSettings.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      // Si no hay configuración, podríamos permitir por defecto o bloquear.
      // Aquí permitimos para no bloquear la campaña si no se han configurado topes.
      return true;
    }

    const newAmount = Number(amount);

    // 1. Validación de tope específico para Publicidad Exterior (Vallas)
    if (cneCode === CneCode.PUBLICIDAD_VALLAS) {
      const currentPublicity = await this.prisma.financialEntry.aggregate({
        where: {
          tenantId,
          cneCode: CneCode.PUBLICIDAD_VALLAS,
          type: EntryType.EXPENSE,
          status: { not: 'REJECTED' },
        },
        _sum: { amount: true },
      });

      const totalPublicity =
        Number(currentPublicity._sum.amount || 0) + newAmount;
      if (totalPublicity > Number(settings.maxPublicityLimit)) {
        throw new ForbiddenException(
          'Tope de gastos excedido para publicidad exterior (CNE 108).',
        );
      }
    }

    // 2. Validación de tope total de la campaña
    const currentTotalExpenses = await this.prisma.financialEntry.aggregate({
      where: {
        tenantId,
        type: EntryType.EXPENSE,
        status: { not: 'REJECTED' },
      },
      _sum: { amount: true },
    });

    const totalCampaignExpenses =
      Number(currentTotalExpenses._sum.amount || 0) + newAmount;
    if (totalCampaignExpenses > Number(settings.maxTotalBudget)) {
      throw new ForbiddenException(
        'Tope de gastos total permitido para la campaña excedido.',
      );
    }

    return true;
  }
}
