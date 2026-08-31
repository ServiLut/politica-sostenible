import {
  CommunicationChannel,
  ConsentCollectionChannel,
  InteractionDirection,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';

describe('InteractionsController', () => {
  const user: AuthenticatedUser = {
    userId: 'agent-a',
    tenantId: 'tenant-a',
    role: Role.ADMIN,
  };
  const service = {
    findAll: jest.fn(),
    create: jest.fn(),
    getCaseConsentStatus: jest.fn(),
    grantCaseConsent: jest.fn(),
    revokeCaseConsent: jest.fn(),
  };
  const controller = new InteractionsController(
    service as unknown as InteractionsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('forwards the authenticated context and validated query', async () => {
    const query = { issueCaseId: 'case-a', page: 1, limit: 20 };
    service.findAll.mockResolvedValue({ items: [], pagination: {} });

    await controller.findAll(user, query);

    expect(service.findAll).toHaveBeenCalledWith(user, query);
  });

  it('forwards only the authenticated context and interaction DTO', async () => {
    const dto = {
      issueCaseId: 'case-a',
      channel: CommunicationChannel.PHONE,
      direction: InteractionDirection.INBOUND,
      summary: 'Llamada recibida',
    };
    service.create.mockResolvedValue({ id: 'interaction-a' });

    await controller.create(user, dto);

    expect(service.create).toHaveBeenCalledWith(user, dto);
  });

  it('forwards case consent status, grant and revocation without subject fields', async () => {
    service.getCaseConsentStatus.mockResolvedValue({ active: false });
    service.grantCaseConsent.mockResolvedValue({ active: true });
    service.revokeCaseConsent.mockResolvedValue({ active: false });

    await controller.getCaseConsentStatus(user, { issueCaseId: 'case-a' });
    await controller.grantCaseConsent(user, '203.0.113.42', {
      issueCaseId: 'case-a',
      collectionChannel: ConsentCollectionChannel.PHONE,
    });
    await controller.revokeCaseConsent(user, '203.0.113.42', {
      issueCaseId: 'case-a',
      reason: 'Solicitud expresa del ciudadano',
    });

    expect(service.getCaseConsentStatus).toHaveBeenCalledWith(user, 'case-a');
    expect(service.grantCaseConsent).toHaveBeenCalledWith(
      user,
      '203.0.113.42',
      expect.not.objectContaining({ voterId: expect.anything() }),
    );
    expect(service.revokeCaseConsent).toHaveBeenCalledWith(
      user,
      '203.0.113.42',
      expect.objectContaining({ issueCaseId: 'case-a' }),
    );
  });
});
