import {
  BadRequestException,
  ForbiddenException,
  NotImplementedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

describe('AiController storage isolation', () => {
  const user: AuthenticatedUser = {
    userId: 'user-from-token',
    tenantId: 'tenant-from-token',
    role: 'ADMIN',
  };

  let extractVoterData: jest.Mock;
  let controller: AiController;

  beforeEach(() => {
    extractVoterData = jest.fn().mockReturnValue({ status: 'QUEUED' });
    controller = new AiController({
      extractVoterData,
      extractReceiptData: jest.fn(),
      analyzeRegionalSentiment: jest.fn(),
      chat: jest.fn(),
    } as unknown as AiService);
  });

  it('uses a Storage object owned by the JWT tenant', () => {
    const result = controller.performOcr(user, {
      objectPath: 'tenant-from-token/evidence/cedula-123.jpg',
    });

    expect(result).toEqual({ status: 'QUEUED' });
    expect(extractVoterData).toHaveBeenCalledWith(
      'tenant-from-token',
      'tenant-from-token/evidence/cedula-123.jpg',
    );
  });

  it('rejects an object path from a tenant supplied by the client', () => {
    expect(() =>
      controller.performOcr(user, {
        objectPath: 'tenant-attacker/evidence/cedula-123.jpg',
      }),
    ).toThrow(ForbiddenException);
    expect(extractVoterData).not.toHaveBeenCalled();
  });

  it.each([
    'tenant-from-token/private/cedula-123.jpg',
    'tenant-from-token/evidence/../cedula-123.jpg',
    'tenant-from-token/evidence/%2e%2e.jpg',
  ])('rejects an unsafe or unsupported object path: %s', (objectPath) => {
    expect(() => controller.performOcr(user, { objectPath })).toThrow(
      BadRequestException,
    );
    expect(extractVoterData).not.toHaveBeenCalled();
  });
});

describe('AiService unconfigured capabilities', () => {
  it('returns 501 instead of fabricated campaign analysis', () => {
    const service = new AiService();

    expect(() => service.chat('tenant-id', '¿Cuántos votantes hay?')).toThrow(
      NotImplementedException,
    );
  });
});
