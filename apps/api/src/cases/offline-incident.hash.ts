import { createHash } from 'node:crypto';
import type { SyncOfflineIncidentDto } from './dto/sync-offline-incident.dto';

export type OfflineIncidentCanonicalInput = Pick<
  SyncOfflineIncidentDto,
  | 'clientOperationId'
  | 'capturedAt'
  | 'category'
  | 'priority'
  | 'title'
  | 'description'
  | 'occurredOn'
  | 'divisionId'
>;

/**
 * This byte contract is mirrored by the browser vault. It deliberately omits
 * tenant/mode and the hash itself; both security contexts come from the token.
 */
export function canonicalOfflineIncident(
  input: OfflineIncidentCanonicalInput,
): string {
  return JSON.stringify({
    capturedAt: new Date(input.capturedAt).toISOString(),
    category: input.category,
    clientOperationId: input.clientOperationId.toLowerCase(),
    description: input.description.trim(),
    divisionId: input.divisionId?.trim() || null,
    occurredOn: input.occurredOn,
    priority: input.priority,
    title: input.title.trim(),
    version: 1,
  });
}

export function offlineIncidentSha256(
  input: OfflineIncidentCanonicalInput,
): string {
  return createHash('sha256')
    .update(canonicalOfflineIncident(input), 'utf8')
    .digest('hex');
}
