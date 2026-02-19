import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ColombiaValidator } from '../common/utils/colombia-validator.util';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, reporterId: string, data: any) {
    // 1. Validar NIT del proveedor (Sección 6.2)
    if (data.type === 'EXPENSE' && data.vendorTaxId) {
      // Si el NIT incluye guion, validamos el DV
      if (data.vendorTaxId.includes('-')) {
        const isValid = ColombiaValidator.isValidNIT(data.vendorTaxId);
        if (!isValid)
          throw new BadRequestException(
            'NIT o Dígito de Verificación inválido',
          );
      }
    }

    // 2. Control de Topes (Sección 6.1)
    const MAX_CAMPAIGN_BUDGET = 500000000; // Ejemplo: 500 Millones
    if (data.type === 'EXPENSE') {
      const summary = await this.getSummary(tenantId);
      const projectedTotal = summary.totalExpenses + Number(data.amount);

      if (projectedTotal > MAX_CAMPAIGN_BUDGET) {
        throw new BadRequestException(
          'ALERTA CNE: Este gasto excede el tope máximo permitido para la campaña.',
        );
      }
    }

    return this.prisma.financialEntry.create({
      data: {
        ...data,
        tenantId,
        reporterId,
        date: new Date(data.date),
      },
    });
  }

  async findAll(tenantId: string) {
    try {
      return await this.prisma.financialEntry.findMany({
        where: { tenantId },
        orderBy: { date: 'desc' },
      });
    } catch (error) {
      console.error('❌ Error in FinanceService.findAll:', error);
      throw error;
    }
  }

  async getSummary(tenantId: string) {
    try {
      const expenses = await this.prisma.financialEntry.aggregate({
        where: { tenantId, type: 'EXPENSE' },
        _sum: { amount: true },
      });
      const income = await this.prisma.financialEntry.aggregate({
        where: { tenantId, type: 'INCOME' },
        _sum: { amount: true },
      });

      return {
        totalExpenses: expenses._sum.amount ? Number(expenses._sum.amount) : 0,
        totalIncome: income._sum.amount ? Number(income._sum.amount) : 0,
        balance:
          (Number(income._sum.amount) || 0) -
          (Number(expenses._sum.amount) || 0),
      };
    } catch (error) {
      console.error('❌ Error in FinanceService.getSummary:', error);
      throw error;
    }
  }

  async validateExpense(
    data: any,
  ): Promise<{ valid: boolean; reason?: string }> {
    // Implementar lógica compleja de validación CNE aquí
    // Ejemplo: Verificar si el proveedor está en lista negra
    if (
      data.vendorName &&
      data.vendorName.toLowerCase().includes('inhabilitado')
    ) {
      return { valid: false, reason: 'Proveedor inhabilitado por CNE' };
    }
    return { valid: true };
  }

  async generateCneReport(tenantId: string): Promise<string> {
    const expenses = await this.prisma.financialEntry.findMany({
      where: { tenantId, type: 'EXPENSE' },
      include: { reporter: true },
      orderBy: { date: 'asc' },
    });

    const header =
      'Fecha,Concepto,Monto,Proveedor,NIT,Código CNE,Responsable\n';
    const rows = expenses
      .map(
        (e) =>
          `${e.date.toISOString().split('T')[0]},"${e.description}",${e.amount},"${e.vendorName}",${e.vendorTaxId},${e.cneCode},${e.reporter.name}`,
      )
      .join('\n');

    return header + rows;
  }
}
