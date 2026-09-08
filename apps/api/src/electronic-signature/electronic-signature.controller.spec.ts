jest.mock('otplib', () => ({ verifySync: jest.fn() }));

import { Role } from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StorageModuleName } from '../storage/storage.constants';
import { ElectronicSignatureController } from './electronic-signature.controller';
import { ElectronicSignatureService } from './electronic-signature.service';

describe('ElectronicSignatureController', () => {
  const user: AuthenticatedUser = {
    tenantId: 'tenant-from-jwt',
    userId: 'user-from-jwt',
    role: Role.FINANCE_MANAGER,
  };
  const service = {
    signDocument: jest.fn(),
    verifySignature: jest.fn(),
  };
  const controller = new ElectronicSignatureController(
    service as unknown as ElectronicSignatureService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('declares explicit signing and verification roles', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        ElectronicSignatureController.prototype.signDocument,
      ) as Role[],
    ).toEqual([
      Role.ADMIN,
      Role.CAMPAIGN_MANAGER,
      Role.FINANCE_MANAGER,
      Role.ZONE_COORDINATOR,
      Role.WITNESS,
    ]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        ElectronicSignatureController.prototype.verifySignature,
      ) as Role[],
    ).toEqual([
      Role.ADMIN,
      Role.CAMPAIGN_MANAGER,
      Role.FINANCE_MANAGER,
      Role.ZONE_COORDINATOR,
      Role.WITNESS,
      Role.COMPLIANCE_OFFICER,
      Role.AUDITOR,
    ]);
  });

  it('delegates signing with identity only from the authenticated context', async () => {
    const dto = {
      documentId: 'document-a',
      module: StorageModuleName.FINANCE,
      resourceId: 'finance-a',
      otpCode: '123456',
    };
    service.signDocument.mockResolvedValue({ id: 'signature-a' });

    await controller.signDocument(user, dto, '203.0.113.10');

    expect(service.signDocument).toHaveBeenCalledWith(
      user,
      dto,
      '203.0.113.10',
    );
  });

  it('requires module/resource context when delegating verification', async () => {
    const query = {
      module: StorageModuleName.FINANCE,
      resourceId: 'finance-a',
    };
    service.verifySignature.mockResolvedValue({
      id: 'signature-a',
      valid: true,
    });

    await controller.verifySignature(user, { id: 'signature-a' }, query);

    expect(service.verifySignature).toHaveBeenCalledWith(
      user,
      'signature-a',
      query,
    );
  });
});
