import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntryType, CneCode } from '../../../prisma/generated/prisma';

@Injectable()
export class CuentasClarasExporter {
  constructor(private prisma: PrismaService) {}

  /**
   * Genera un string en formato CSV compatible con el Formulario 5B del CNE.
   * Formato: FECHA | NIT_PROVEEDOR | NOMBRE_PROVEEDOR | CONCEPTO | VALOR | CODIGO_CNE
   */
  async exportToCSV(tenantId: string): Promise<string> {
    const expenses = await this.prisma.financialEntry.findMany({
      where: {
        tenantId,
        type: EntryType.EXPENSE,
        status: 'APPROVED',
      },
      orderBy: { date: 'asc' },
    });

    const header = 'FECHA|NIT_PROVEEDOR|NOMBRE_PROVEEDOR|CONCEPTO|VALOR|CODIGO_CNE';
    const rows = expenses.map((exp) => {
      const dateStr = exp.date.toISOString().split('T')[0];
      const cneCodeNumeric = this.mapCneEnumToNumeric(exp.cneCode);
      
      return [
        dateStr,
        exp.vendorTaxId,
        exp.vendorName,
        exp.description.replace(/\|/g, '-'), // Evitar conflictos con el delimitador
        exp.amount.toString(),
        cneCodeNumeric,
      ].join('|');
    });

    return [header, ...rows].join('\n');
  }

  /**
   * Mapea el Enum interno a los códigos oficiales de la Resolución CNE.
   */
  private mapCneEnumToNumeric(code: CneCode): string {
    const mapping: Record<CneCode, string> = {
      [CneCode.PUBLICIDAD_VALLAS]: '108',
      [CneCode.TRANSPORTE]: '110',
      [CneCode.SEDE_CAMPANA]: '102',
      [CneCode.ACTOS_PUBLICOS]: '105',
      [CneCode.OTROS]: '199',
    };
    return mapping[code] || '199';
  }
}
