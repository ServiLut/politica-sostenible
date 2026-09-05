import { Test, TestingModule } from '@nestjs/testing';
import { RetentionService } from './retention.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  tenant: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('RetentionService', () => {
  let service: RetentionService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<RetentionService>(RetentionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip tenants without OperationProfile', async () => {
    mockPrismaService.tenant.findMany.mockResolvedValue([
      { id: 't1', operationProfile: null },
    ]);

    await service.handleDataRetention();
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
  });

  it('should skip tenants whose retention period hasn\'t expired', async () => {
    const now = new Date();
    mockPrismaService.tenant.findMany.mockResolvedValue([
      {
        id: 't2',
        operationProfile: {
          retentionPeriodDays: 30,
          createdAt: now, // created now, hasn't expired
        },
      },
    ]);

    await service.handleDataRetention();
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
  });

  it('should delete voter data when retention period has expired', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 40); // 40 days ago

    mockPrismaService.tenant.findMany.mockResolvedValue([
      {
        id: 't3',
        defaultMode: 'CAMPAIGN',
        operationProfile: {
          retentionPeriodDays: 30,
          createdAt: pastDate,
        },
      },
    ]);

    const txMock = {
      consentRecord: {
        updateMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      interaction: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      voter: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      auditEvent: {
        create: jest.fn(),
      },
    };

    mockPrismaService.$transaction.mockImplementation(async (cb) => {
      await cb(txMock);
    });

    await service.handleDataRetention();

    expect(mockPrismaService.$transaction).toHaveBeenCalled();
    expect(txMock.consentRecord.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't3' },
      data: { status: 'EXPIRED' },
    });
    expect(txMock.interaction.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't3' },
    });
    expect(txMock.consentRecord.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't3' },
    });
    expect(txMock.voter.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't3' },
    });
    expect(txMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DATA_RETENTION_EXECUTED',
          actorType: 'SYSTEM',
        }),
      }),
    );
  });
});
