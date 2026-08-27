import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TeamService } from './team.service';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

const admin: AuthenticatedUser = {
  userId: 'admin-a',
  tenantId: 'tenant-a',
  role: Role.ADMIN,
};

function createHarness(
  mode: PoliticalOperationMode = PoliticalOperationMode.CAMPAIGN,
) {
  const tx = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ defaultMode: mode }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: admin.userId }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest
        .fn<Promise<unknown[]>, [Prisma.UserFindManyArgs]>()
        .mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'new-user' }),
      updateMany: jest
        .fn<Promise<{ count: number }>, [Prisma.UserUpdateManyArgs]>()
        .mockResolvedValue({ count: 1 }),
    },
    teamInvitation: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn<
        Promise<unknown>,
        [Prisma.TeamInvitationFindUniqueArgs]
      >(),
      findMany: jest
        .fn<Promise<unknown[]>, [Prisma.TeamInvitationFindManyArgs]>()
        .mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn<
          Promise<{
            id: string;
            email: string;
            role: Role;
            expiresAt: Date | string;
            createdAt: Date;
          }>,
          [Prisma.TeamInvitationCreateArgs]
        >()
        .mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'invitation-a',
            email: data.email,
            role: data.role,
            expiresAt: data.expiresAt,
            createdAt: new Date('2026-08-21T12:00:00.000Z'),
          }),
        ),
      updateMany: jest
        .fn<Promise<{ count: number }>, [Prisma.TeamInvitationUpdateManyArgs]>()
        .mockResolvedValue({ count: 1 }),
    },
    auditEvent: {
      create: jest
        .fn<Promise<{ id: string }>, [Prisma.AuditEventCreateArgs]>()
        .mockResolvedValue({ id: 'audit-a' }),
      createMany: jest
        .fn<Promise<{ count: number }>, [Prisma.AuditEventCreateManyArgs]>()
        .mockResolvedValue({ count: 2 }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const config = {
    get: jest
      .fn()
      .mockImplementation((key: string) =>
        key === 'NEXT_PUBLIC_APP_URL'
          ? 'https://politica.example.test'
          : undefined,
      ),
  };
  const service = new TeamService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );

  return { config, prisma, service, tx };
}

describe('TeamService administration and tenant isolation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes member reads to the JWT tenant and never selects credentials', async () => {
    const { service, tx } = createHarness();

    await service.listMembers(admin, { page: 2, limit: 10, search: 'ana' });

    const memberQuery = tx.user.findMany.mock.calls[0][0];
    expect(memberQuery.where).toMatchObject({ tenantId: 'tenant-a' });
    expect(memberQuery.skip).toBe(10);
    expect(memberQuery.take).toBe(10);
    expect(memberQuery.select).toEqual({
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    });
    expect(memberQuery.select).not.toHaveProperty('password');
    expect(memberQuery.select).not.toHaveProperty('documentId');
  });

  it('lists only live pending invitations without token hashes', async () => {
    const { service, tx } = createHarness();

    await service.listPendingInvitations(admin, {});

    const invitationQuery = tx.teamInvitation.findMany.mock.calls[0][0];
    expect(invitationQuery.where).toMatchObject({
      tenantId: 'tenant-a',
      acceptedAt: null,
    });
    const expiryFilter = invitationQuery.where
      ?.expiresAt as Prisma.DateTimeFilter;
    expect(expiryFilter.gt).toBeInstanceOf(Date);
    expect(invitationQuery.select).not.toHaveProperty('tokenHash');
  });

  it('rejects a stale or non-admin JWT before reading team data', async () => {
    const { service, tx } = createHarness();

    await expect(
      service.listMembers({ ...admin, role: Role.CAMPAIGN_MANAGER }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.user.findMany).not.toHaveBeenCalled();
  });

  it('rejects an actor that was demoted after its JWT was issued', async () => {
    const { service, tx } = createHarness();
    tx.user.findFirst.mockResolvedValue(null);

    await expect(service.listMembers(admin, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.user.findMany).not.toHaveBeenCalled();
  });

  it('creates a one-time link while persisting only SHA-256', async () => {
    const { prisma, service, tx } = createHarness();

    const result = await service.createInvitation(admin, {
      email: ' Persona@Example.TEST ',
      role: Role.VOLUNTEER,
    });

    const url = new URL(result.invitationUrl);
    const token = new URLSearchParams(url.hash.slice(1)).get('token');
    expect(url.origin).toBe('https://politica.example.test');
    expect(url.pathname).toBe('/aceptar-invitacion');
    expect(url.search).toBe('');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const persisted = tx.teamInvitation.create.mock.calls[0][0].data;
    expect(persisted.email).toBe('persona@example.test');
    expect(persisted.tokenHash).toBe(
      createHash('sha256')
        .update(token as string)
        .digest('hex'),
    );
    expect(persisted.tokenHash).not.toBe(token);
    expect(result).not.toHaveProperty('tokenHash');
    expect(result.delivery).toBe('MANUAL');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    const serializedAudit = JSON.stringify(
      tx.auditEvent.create.mock.calls[0][0],
    );
    expect(serializedAudit).not.toContain('persona@example.test');
    expect(serializedAudit).not.toContain(token as string);
  });

  it.each([
    [PoliticalOperationMode.CAMPAIGN, Role.ADMIN],
    [PoliticalOperationMode.CAMPAIGN, Role.CASE_WORKER],
    [PoliticalOperationMode.PUBLIC_OFFICE, Role.CAMPAIGN_MANAGER],
    [PoliticalOperationMode.PUBLIC_OFFICE, Role.WITNESS],
  ])('rejects role %s/%s outside the active mode', async (mode, role) => {
    const { service, tx } = createHarness(mode);

    await expect(
      service.createInvitation(admin, {
        email: 'persona@example.test',
        role,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.teamInvitation.create).not.toHaveBeenCalled();
  });

  it('allows a constituent case worker only in public-office mode', async () => {
    const { service } = createHarness(PoliticalOperationMode.PUBLIC_OFFICE);

    await expect(
      service.createInvitation(admin, {
        email: 'gestor@example.test',
        role: Role.CASE_WORKER,
      }),
    ).resolves.toMatchObject({ delivery: 'MANUAL' });
  });

  it('does not create duplicates for an existing global account or live invitation', async () => {
    const existing = createHarness();
    existing.tx.user.findUnique.mockResolvedValue({ id: 'existing-user' });
    await expect(
      existing.service.createInvitation(admin, {
        email: 'existing@example.test',
        role: Role.VOLUNTEER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const pending = createHarness();
    pending.tx.teamInvitation.findFirst.mockResolvedValue({ id: 'pending' });
    await expect(
      pending.service.createInvitation(admin, {
        email: 'pending@example.test',
        role: Role.VOLUNTEER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails closed when the public application origin is unsafe', async () => {
    const { config, service, tx } = createHarness();
    config.get.mockReturnValue('https://user:secret@example.test/path');

    await expect(
      service.createInvitation(admin, {
        email: 'persona@example.test',
        role: Role.VOLUNTEER,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(tx.teamInvitation.create).not.toHaveBeenCalled();
  });
});

describe('TeamService member lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  function withTarget(
    overrides: Partial<{ id: string; role: Role; isActive: boolean }> = {},
    mode: PoliticalOperationMode = PoliticalOperationMode.CAMPAIGN,
  ) {
    const harness = createHarness(mode);
    const target = {
      id: 'member-a',
      role: Role.VOLUNTEER,
      isActive: true,
      ...overrides,
    };
    harness.tx.user.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: admin.userId })
      .mockResolvedValueOnce(target);
    return { ...harness, target };
  }

  it('changes an allowed role atomically with tenant filtering and PII-free audit', async () => {
    const { prisma, service, tx } = withTarget();

    await expect(
      service.updateMemberRole(admin, 'member-a', {
        role: Role.CAMPAIGN_MANAGER,
      }),
    ).resolves.toEqual({
      id: 'member-a',
      role: Role.CAMPAIGN_MANAGER,
      isActive: true,
    });

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'member-a',
        tenantId: 'tenant-a',
        role: Role.VOLUNTEER,
        isActive: true,
      },
      data: { role: Role.CAMPAIGN_MANAGER },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        actorUserId: 'admin-a',
        action: 'TEAM_MEMBER_ROLE_CHANGED',
        resourceType: 'User',
        resourceId: 'member-a',
        before: { role: Role.VOLUNTEER },
        after: { role: Role.CAMPAIGN_MANAGER },
      }),
    });
    const serializedAudit = JSON.stringify(tx.auditEvent.create.mock.calls[0]);
    expect(serializedAudit).not.toContain('@');
    expect(serializedAudit).not.toContain('document');
    expect(serializedAudit).not.toContain('phone');
  });

  it('deactivates and reactivates only the selected tenant member', async () => {
    const deactivation = withTarget();

    await expect(
      deactivation.service.updateMemberStatus(admin, 'member-a', {
        isActive: false,
      }),
    ).resolves.toEqual({
      id: 'member-a',
      role: Role.VOLUNTEER,
      isActive: false,
    });
    expect(deactivation.tx.user.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'member-a',
        tenantId: 'tenant-a',
        isActive: true,
      }),
      data: { isActive: false },
    });
    expect(deactivation.tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'TEAM_MEMBER_DEACTIVATED',
        before: { isActive: true },
        after: { isActive: false },
      }),
    });

    const reactivation = withTarget({ isActive: false });
    await reactivation.service.updateMemberStatus(admin, 'member-a', {
      isActive: true,
    });
    expect(reactivation.tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'TEAM_MEMBER_ACTIVATED' }),
    });
  });

  it.each([
    ['self', { id: admin.userId, role: Role.VOLUNTEER }],
    ['administrator', { id: 'other-admin', role: Role.ADMIN }],
  ])('never modifies the %s account', async (_label, target) => {
    const { service, tx } = withTarget(target);

    await expect(
      service.updateMemberStatus(admin, target.id, { isActive: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it.each([
    [PoliticalOperationMode.CAMPAIGN, Role.ADMIN],
    [PoliticalOperationMode.CAMPAIGN, Role.CASE_WORKER],
    [PoliticalOperationMode.PUBLIC_OFFICE, Role.CAMPAIGN_MANAGER],
  ])('rejects a role outside mode %s: %s', async (mode, role) => {
    const { service, tx } = withTarget({}, mode);

    await expect(
      service.updateMemberRole(admin, 'member-a', { role }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when the target is absent from the actor tenant', async () => {
    const { service, tx } = withTarget();
    tx.user.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: admin.userId })
      .mockResolvedValueOnce(null);

    await expect(
      service.updateMemberStatus(admin, 'tenant-b-member', {
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.user.findFirst.mock.calls[1][0].where).toEqual({
      id: 'tenant-b-member',
      tenantId: 'tenant-a',
    });
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('does not emit duplicate audit events for idempotent requests', async () => {
    const { service, tx } = withTarget({ role: Role.WITNESS });

    await expect(
      service.updateMemberRole(admin, 'member-a', { role: Role.WITNESS }),
    ).resolves.toMatchObject({ role: Role.WITNESS });
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('returns conflict when an optimistic update loses a concurrent race', async () => {
    const { service, tx } = withTarget();
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateMemberStatus(admin, 'member-a', { isActive: false }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('maps serializable transaction retries to a safe conflict', async () => {
    const { prisma, service } = withTarget();
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });

    await expect(
      service.updateMemberRole(admin, 'member-a', {
        role: Role.CAMPAIGN_MANAGER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('TeamService invitation acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(bcrypt.hash).mockResolvedValue('bcrypt-12-hash' as never);
  });

  const token = 't'.repeat(43);
  const acceptance = {
    token,
    password: 'una-clave-segura-2026',
    name: 'Ana Perez',
    documentId: '1012345678',
    phone: '+573001234567',
    termsAccepted: true,
    termsVersion: '2026.1',
  } as const;

  function withValidInvitation() {
    const harness = createHarness();
    harness.tx.teamInvitation.findUnique.mockResolvedValue({
      id: 'invitation-a',
      tenantId: 'tenant-a',
      email: 'invited@example.test',
      role: Role.VOLUNTEER,
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      tenant: { defaultMode: PoliticalOperationMode.CAMPAIGN },
    });
    return harness;
  }

  it('atomically consumes the token, creates the scoped user and audits terms', async () => {
    const { prisma, service, tx } = withValidInvitation();

    await expect(service.acceptInvitation(acceptance)).resolves.toEqual({
      message: 'Invitacion aceptada. Ya puedes iniciar sesion.',
    });

    const lookup = tx.teamInvitation.findUnique.mock.calls[0][0];
    expect(lookup.where.tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(lookup.select).toBeDefined();
    const consumption = tx.teamInvitation.updateMany.mock.calls[0][0];
    expect(consumption.where).toMatchObject({
      id: 'invitation-a',
      tenantId: 'tenant-a',
      acceptedAt: null,
    });
    const consumptionExpiry = consumption.where
      .expiresAt as Prisma.DateTimeFilter;
    expect(consumptionExpiry.gt).toBeInstanceOf(Date);
    expect(consumption.data.acceptedAt).toBeInstanceOf(Date);
    expect(bcrypt.hash).toHaveBeenCalledWith(acceptance.password, 12);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        email: 'invited@example.test',
        password: 'bcrypt-12-hash',
        name: 'Ana Perez',
        documentId: '1012345678',
        phone: '+573001234567',
        role: Role.VOLUNTEER,
      },
      select: { id: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    const auditData = tx.auditEvent.createMany.mock.calls[0][0].data;
    const auditPayload = Array.isArray(auditData) ? auditData : [auditData];
    expect(auditPayload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'TEAM_INVITATION_ACCEPTED',
          resourceId: 'invitation-a',
          metadata: { role: Role.VOLUNTEER },
        }),
        expect.objectContaining({
          action: 'ACCOUNT_TERMS_ACCEPTED',
          metadata: { termsVersion: '2026.1' },
        }),
      ]),
    );
    const serializedAudit = JSON.stringify(auditPayload);
    expect(serializedAudit).not.toContain(token);
    expect(serializedAudit).not.toContain('invited@example.test');
    expect(serializedAudit).not.toContain(acceptance.documentId);
    expect(serializedAudit).not.toContain(acceptance.phone);
    expect(serializedAudit).not.toContain(acceptance.password);
  });

  it.each([
    ['missing', null],
    [
      'expired',
      {
        id: 'invitation-a',
        tenantId: 'tenant-a',
        email: 'invited@example.test',
        role: Role.VOLUNTEER,
        expiresAt: new Date(Date.now() - 60_000),
        acceptedAt: null,
        tenant: { defaultMode: PoliticalOperationMode.CAMPAIGN },
      },
    ],
    [
      'used',
      {
        id: 'invitation-a',
        tenantId: 'tenant-a',
        email: 'invited@example.test',
        role: Role.VOLUNTEER,
        expiresAt: new Date(Date.now() + 60_000),
        acceptedAt: new Date(),
        tenant: { defaultMode: PoliticalOperationMode.CAMPAIGN },
      },
    ],
  ])(
    'rejects a %s invitation with the same generic response',
    async (_label, row) => {
      const { service, tx } = createHarness();
      tx.teamInvitation.findUnique.mockResolvedValue(row);

      await expect(service.acceptInvitation(acceptance)).rejects.toThrow(
        'Invitacion invalida, vencida o utilizada',
      );
      expect(tx.user.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a role made invalid by a later tenant mode change', async () => {
    const { service, tx } = withValidInvitation();
    tx.teamInvitation.findUnique.mockResolvedValue({
      id: 'invitation-a',
      tenantId: 'tenant-a',
      email: 'invited@example.test',
      role: Role.WITNESS,
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      tenant: { defaultMode: PoliticalOperationMode.PUBLIC_OFFICE },
    });

    await expect(service.acceptInvitation(acceptance)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('enforces global email uniqueness before creating the account', async () => {
    const { service, tx } = withValidInvitation();
    tx.user.findUnique.mockResolvedValue({ id: 'existing-global-user' });

    await expect(service.acceptInvitation(acceptance)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.teamInvitation.updateMany).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('fails a concurrent second consumption without creating a user', async () => {
    const { service, tx } = withValidInvitation();
    tx.teamInvitation.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.acceptInvitation(acceptance)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('rejects passwords larger than the bcrypt UTF-8 boundary before hashing', async () => {
    const { prisma, service } = withValidInvitation();

    await expect(
      service.acceptInvitation({ ...acceptance, password: 'a'.repeat(73) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps serializable transaction conflicts to a safe retry response', async () => {
    const { prisma, service } = withValidInvitation();
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });

    await expect(service.acceptInvitation(acceptance)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
