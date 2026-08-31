import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma/prisma.service';

describe('HealthController', () => {
  const findFirst = jest.fn();
  const prisma = {
    tenant: { findFirst },
  } as unknown as PrismaService;
  const controller = new HealthController(prisma);

  beforeEach(() => findFirst.mockReset());

  it('reports readiness only after querying an application table', async () => {
    findFirst.mockResolvedValue(null);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });
    expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
  });

  it('reports unavailable when the schema or database cannot be queried', async () => {
    findFirst.mockRejectedValue(new Error('relation does not exist'));

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
