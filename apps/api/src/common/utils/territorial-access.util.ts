import { ForbiddenException } from '@nestjs/common';
import { Prisma, Role } from '../../../prisma/generated/prisma';

type TerritorialAccessClient = Pick<
  Prisma.TransactionClient,
  'user' | 'politicalDivision'
>;

export interface TerritorialAccessOptions {
  client: TerritorialAccessClient;
  tenantId: string;
  userId: string;
  allowedRoles: readonly Role[];
  territoriallyScopedRoles: readonly Role[];
}

export interface TerritorialAccess {
  role: Role;
  /** `null` means the role is allowed to operate across the whole tenant. */
  divisionIds: string[] | null;
}

/**
 * Resolves authorization from the current database record, never from JWT role
 * or client-provided tenant/division fields. Scoped roles can only operate on
 * their assigned division and its descendants inside the authenticated tenant.
 */
export async function resolveTerritorialAccess({
  client,
  tenantId,
  userId,
  allowedRoles,
  territoriallyScopedRoles,
}: TerritorialAccessOptions): Promise<TerritorialAccess> {
  const actor = await client.user.findFirst({
    where: { id: userId, tenantId, isActive: true },
    select: { role: true, divisionId: true },
  });

  if (!actor || !allowedRoles.includes(actor.role)) {
    throw new ForbiddenException(
      'El usuario no tiene permisos vigentes para esta operación',
    );
  }

  if (!territoriallyScopedRoles.includes(actor.role)) {
    return { role: actor.role, divisionIds: null };
  }

  if (!actor.divisionId) {
    throw new ForbiddenException(
      'El usuario requiere una asignación territorial vigente',
    );
  }

  const divisions = await client.politicalDivision.findMany({
    where: { tenantId },
    select: { id: true, parentId: true },
  });
  const tenantDivisionIds = new Set(divisions.map(({ id }) => id));

  if (!tenantDivisionIds.has(actor.divisionId)) {
    throw new ForbiddenException(
      'La asignación territorial no pertenece a la organización autenticada',
    );
  }

  const descendantsByParent = new Map<string, string[]>();
  for (const division of divisions) {
    if (!division.parentId || !tenantDivisionIds.has(division.parentId)) {
      continue;
    }
    const descendants = descendantsByParent.get(division.parentId) ?? [];
    descendants.push(division.id);
    descendantsByParent.set(division.parentId, descendants);
  }

  const divisionIds: string[] = [];
  const pending = [actor.divisionId];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const divisionId = pending.pop();
    if (!divisionId || visited.has(divisionId)) continue;

    visited.add(divisionId);
    divisionIds.push(divisionId);
    pending.push(...(descendantsByParent.get(divisionId) ?? []));
  }

  return { role: actor.role, divisionIds };
}
