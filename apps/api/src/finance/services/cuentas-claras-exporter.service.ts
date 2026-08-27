import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntryType } from '../../../prisma/generated/prisma';
import { buildPipeDelimitedRow } from '../../common/utils/csv.util';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../../common/utils/campaign-mode.util';

@Injectable()
export class CuentasClarasExporter {
  constructor(private prisma: PrismaService) {}

  /** Exportación interna de revisión. No sustituye el reporte oficial. */
  async exportToCSV(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    assertCampaignTenant(tenant);

    const expenses = await this.prisma.financialEntry.findMany({
      where: {
        tenantId,
        type: EntryType.EXPENSE,
        status: 'APPROVED',
      },
      orderBy: { date: 'asc' },
    });

    const header = buildPipeDelimitedRow([
      'FECHA',
      'NIT_PROVEEDOR',
      'NOMBRE_PROVEEDOR',
      'CONCEPTO',
      'VALOR',
      'CATEGORIA_INTERNA',
    ]);
    const rows = expenses.map((exp) => {
      const dateStr = exp.date.toISOString().split('T')[0];
      return buildPipeDelimitedRow([
        dateStr,
        exp.vendorTaxId,
        exp.vendorName,
        exp.description,
        exp.amount.toString(),
        exp.cneCode,
      ]);
    });

    return [header, ...rows].join('\n');
  }
}
