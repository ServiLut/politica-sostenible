import {
  CneCode,
  EntryType,
  PoliticalOperationMode,
  TenantType,
} from '../../../prisma/generated/prisma';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CuentasClarasExporter } from './cuentas-claras-exporter.service';

describe('CuentasClarasExporter tenant isolation', () => {
  it('scopes the export and prevents formula, delimiter and row injection', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        date: new Date('2026-08-21T00:00:00.000Z'),
        vendorTaxId: '=1+1',
        vendorName: 'ACME|SAS\nsegunda fila',
        description: '+CMD()',
        amount: { toString: () => '1000' },
        cneCode: CneCode.OTROS,
      },
    ]);
    const exporter = new CuentasClarasExporter({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      financialEntry: { findMany },
    } as unknown as PrismaService);

    const csv = await exporter.exportToCSV('tenant-from-jwt');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-from-jwt',
        type: EntryType.EXPENSE,
        status: 'APPROVED',
      },
      orderBy: { date: 'asc' },
    });
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv.split('\n')[1].split('|')).toHaveLength(6);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+CMD()");
    expect(csv).toContain('ACME SAS segunda fila');
  });

  it('blocks internal exports in public-office mode', async () => {
    const findMany = jest.fn();
    const exporter = new CuentasClarasExporter({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.PUBLIC_OFFICE,
        }),
      },
      financialEntry: { findMany },
    } as unknown as PrismaService);

    await expect(exporter.exportToCSV('tenant-office')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
