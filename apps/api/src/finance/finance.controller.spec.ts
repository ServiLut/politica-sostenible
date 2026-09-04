import type { Response } from 'express';
import { Role } from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

describe('FinanceController CNE review draft', () => {
  const user: AuthenticatedUser = {
    tenantId: 'tenant-from-jwt',
    userId: 'auditor-from-jwt',
    role: Role.AUDITOR,
  };

  function buildResponse() {
    return {
      header: jest.fn(),
      send: jest.fn().mockReturnValue({ sent: true }),
    };
  }

  it('uses the authenticated tenant and actor before sending the audited CSV', async () => {
    const generateCneReport = jest.fn().mockResolvedValue('Fecha,Monto');
    const controller = new FinanceController({
      generateCneReport,
    } as unknown as FinanceService);
    const response = buildResponse();

    await expect(
      controller.getCneReport(user, response as unknown as Response),
    ).resolves.toEqual({ sent: true });

    expect(generateCneReport).toHaveBeenCalledWith(
      'tenant-from-jwt',
      'auditor-from-jwt',
    );
    expect(response.send).toHaveBeenCalledWith('Fecha,Monto');
  });

  it('does not start an HTTP download when the audit-backed export fails', async () => {
    const generateCneReport = jest
      .fn()
      .mockRejectedValue(new Error('audit unavailable'));
    const controller = new FinanceController({
      generateCneReport,
    } as unknown as FinanceService);
    const response = buildResponse();

    await expect(
      controller.getCneReport(user, response as unknown as Response),
    ).rejects.toThrow('audit unavailable');

    expect(response.header).not.toHaveBeenCalled();
    expect(response.send).not.toHaveBeenCalled();
  });

  it('uses only the authenticated tenant and actor to confirm an external filing', async () => {
    const markReportedToCne = jest.fn().mockResolvedValue({
      id: 'entry-a',
      status: 'REPORTED_CNE',
    });
    const controller = new FinanceController({
      markReportedToCne,
    } as unknown as FinanceService);
    const dto = { externalReference: 'CC-2026/004219' };
    const reportingUser = {
      ...user,
      userId: 'compliance-from-jwt',
      role: Role.COMPLIANCE_OFFICER,
    };

    await expect(
      controller.markReportedToCne(reportingUser, 'entry-a', dto),
    ).resolves.toEqual({ id: 'entry-a', status: 'REPORTED_CNE' });
    expect(markReportedToCne).toHaveBeenCalledWith(
      'tenant-from-jwt',
      'compliance-from-jwt',
      'entry-a',
      dto,
    );
    expect(dto).not.toHaveProperty('tenantId');
    expect(dto).not.toHaveProperty('tenant_id');
  });
});
