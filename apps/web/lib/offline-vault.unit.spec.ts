import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createOfflineVaultSession,
  decryptOfflineVaultPayload,
  deleteOfflineQueueRecord,
  deriveOfflineVaultPartition,
  enqueueOfflineE14,
  enqueueOfflineIncident,
  enqueueOfflineVoter,
  encryptOfflineVaultPayload,
  inspectOfflineVaultStoragePersistence,
  listOfflineHeatmapSnapshots,
  listOfflineQueue,
  OFFLINE_HEATMAP_MAX_SNAPSHOTS,
  OFFLINE_HEATMAP_MAX_SNAPSHOT_BYTES,
  OFFLINE_HEATMAP_MAX_TOTAL_BYTES,
  OFFLINE_E14_MAX_FILE_BYTES,
  OFFLINE_E14_MAX_QUEUE_ENTRIES,
  OfflineQueueAuthorizationError,
  OfflineQueueForegroundRequiredError,
  OfflineQueueSynchronizer,
  OfflineVaultIntegrityError,
  offlineSyncBackoffMilliseconds,
  provisionOfflineCaptureContext,
  provisionOfflineE14Grant,
  provisionOfflineIncidentContext,
  pruneOfflineHeatmapSnapshots,
  readOfflineHeatmapSnapshot,
  readOfflineCalendarSnapshot,
  readOfflineIncidentContext,
  requestOfflineVaultStoragePersistence,
  requiredVaultUpgradeSteps,
  retryFailedOfflineQueueRecord,
  saveOfflineHeatmapSnapshot,
  saveOfflineCalendarSnapshot,
  unlockOfflineVaultSession,
  upgradeOfflineVaultDatabase,
  validateOfflineE14Grant,
  validateStoredRecord,
  type OfflineSyncReceipt,
  type OfflineElectoralCalendarSnapshot,
  type OfflineVaultIdentity,
  type StoredVaultRecord,
  type VaultRecordStore,
} from "./offline-vault";
import type {
  OfflineE14CaptureGrant,
  OfflineE14ReportInput,
  OfflineE14SyncReceipt,
} from "./offline-e14-api";
import type {
  OfflineIncidentCaptureContext,
  OfflineIncidentInput,
  OfflineIncidentSyncReceipt,
} from "./offline-incidents-api";
import type {
  TerritoryHeatmapQuery,
  TerritoryHeatmapResponse,
  TerritoryHeatmapSnapshot,
} from "./territory-heatmap";
import type { CreateVoterInput, VoterCaptureContext } from "./voters-api";

const IDENTITY: OfflineVaultIdentity = {
  tenantId: "tenant-campana-2026",
  userId: "user-volunteer-42",
};
const OTHER_IDENTITY: OfflineVaultIdentity = {
  tenantId: "tenant-campana-2026",
  userId: "user-volunteer-99",
};
const PASSPHRASE = "Frase operativa segura 2026";
const FIXED_NOW = new Date("2026-09-09T15:00:00.000Z");
const CAPTURED_AT = "2026-09-09T14:58:00.000Z";

const CAPTURE_CONTEXT: VoterCaptureContext = {
  puestos: [
    {
      id: "puesto-kennedy-001",
      code: "110010101",
      name: "Colegio Distrital Kennedy",
    },
  ],
  consentNotice: {
    id: "notice-political-2026",
    mode: "CAMPAIGN",
    purpose: "POLITICAL_COMMUNICATION",
    version: "v2026_09",
    title: "Autorización de tratamiento político",
    content: "La persona autoriza el tratamiento informado de sus datos.",
    controllerName: "Campaña verificable",
    contactEmail: "privacidad@example.test",
    privacyPolicyUrl: "https://example.test/privacidad",
    activatedAt: "2026-09-01T00:00:00.000Z",
  },
};

const VOTER_INPUT: CreateVoterInput = {
  documentId: "1032456789",
  firstName: "María Fernanda",
  lastName: "Gómez Rojas",
  phone: "+57 300 555 0199",
  email: "maria.gomez@example.test",
  puestoId: "puesto-kennedy-001",
  mesa: 17,
  consentAccepted: true,
  termsVersion: "v2026_09",
  collectionChannel: "IN_PERSON",
};

const HEATMAP_QUERY: TerritoryHeatmapQuery = {
  level: "DEPARTAMENTO",
  metric: "E14_COVERAGE",
  parentId: null,
};

function heatmapResponse(
  query: TerritoryHeatmapQuery = HEATMAP_QUERY,
  itemCount = 1,
  textLength = 0,
): TerritoryHeatmapResponse {
  const parent =
    query.parentId === null
      ? null
      : {
          id: query.parentId,
          code: query.parentId.slice(0, 128),
          name: `Padre ${query.parentId}`.slice(0, 256),
          type: "DEPARTAMENTO" as const,
        };
  return {
    generatedAt: "2026-09-09T15:00:00.000Z",
    level: query.level,
    metric: {
      code: query.metric,
      label: "Indicador territorial",
      unit: query.metric === "E14_COVERAGE" ? "PERCENT" : "COUNT",
    },
    parent,
    breadcrumbs: parent ? [parent] : [],
    privacy: {
      minimumReportableCount: query.metric === "E14_COVERAGE" ? null : 5,
      rule: textLength > 0 ? "R".repeat(2_000) : "Agregados autorizados.",
    },
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `territorio-${String(index).padStart(4, "0")}`,
      code:
        textLength > 0
          ? `${String(index).padStart(4, "0")}${"C".repeat(124)}`
          : String(index).padStart(4, "0"),
      name:
        textLength > 0
          ? `${String(index).padStart(4, "0")}${"N".repeat(252)}`
          : `Territorio ${index}`,
      type: query.level,
      parentId: query.parentId,
      hasChildren: false,
      nextLevel: null,
      value: query.metric === "E14_COVERAGE" ? 65 : 10,
      displayValue:
        textLength > 0
          ? "D".repeat(100)
          : query.metric === "E14_COVERAGE"
            ? "65 %"
            : "10",
      suppressed: false,
      intensity: 65,
      bucket: 4,
      operationalContext: { expectedTables: 200, acceptedTables: 130 },
      geo: {
        latitude: 4.711,
        longitude: -74.0721,
        basis: query.level === "PUESTO" ? "POLLING_PLACE" : "CENTROID",
        locatedPollingPlaces: query.level === "PUESTO" ? 1 : 10,
        totalPollingPlaces: query.level === "PUESTO" ? 1 : 10,
      },
    })),
  };
}

function heatmapSnapshot(
  query: TerritoryHeatmapQuery,
  savedAt: string,
  itemCount = 1,
  textLength = 0,
): TerritoryHeatmapSnapshot {
  return {
    schemaVersion: 1,
    query,
    savedAt,
    response: heatmapResponse(query, itemCount, textLength),
  };
}

function cloneRecord(record: StoredVaultRecord): StoredVaultRecord {
  return structuredClone(record);
}

function recordsEqual(left: StoredVaultRecord, right: StoredVaultRecord) {
  return JSON.stringify(left) === JSON.stringify(right);
}

class MemoryVaultStore implements VaultRecordStore {
  readonly records = new Map<string, StoredVaultRecord>();

  constructor(readonly partitionHash: string) {}

  async list() {
    return [...this.records.values()]
      .map(cloneRecord)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async get(id: string) {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : null;
  }

  async put(record: StoredVaultRecord) {
    this.records.set(record.id, cloneRecord(validateStoredRecord(record)));
  }

  async replaceIfUnchanged(
    expected: StoredVaultRecord,
    replacement: StoredVaultRecord,
  ) {
    const current = this.records.get(expected.id);
    if (!current || !recordsEqual(current, expected)) return false;
    this.records.set(
      replacement.id,
      cloneRecord(validateStoredRecord(replacement)),
    );
    return true;
  }

  async deleteIfUnchanged(expected: StoredVaultRecord) {
    const current = this.records.get(expected.id);
    if (!current || !recordsEqual(current, expected)) return false;
    this.records.delete(expected.id);
    return true;
  }

  rawRecords() {
    return [...this.records.values()].map(cloneRecord);
  }
}

async function preparedQueue() {
  const partitionHash = await deriveOfflineVaultPartition(IDENTITY);
  const store = new MemoryVaultStore(partitionHash);
  const session = await createOfflineVaultSession(
    store,
    IDENTITY,
    PASSPHRASE,
    FIXED_NOW,
  );
  await provisionOfflineCaptureContext(session, CAPTURE_CONTEXT, FIXED_NOW);
  const operationId = await enqueueOfflineVoter(
    session,
    VOTER_INPUT,
    CAPTURED_AT,
    FIXED_NOW,
  );
  return { operationId, partitionHash, session, store };
}

function receiptFor(
  operationId: string,
  status: OfflineSyncReceipt["status"] = "APPLIED",
): OfflineSyncReceipt {
  return {
    received: true,
    receiptId: `receipt-${operationId}`,
    clientOperationId: operationId,
    operationType: "VOTER_CAPTURE",
    status,
    capturedAt: CAPTURED_AT,
    receivedAt: "2026-09-09T15:01:00.000Z",
  };
}

const E14_GRANT: OfflineE14CaptureGrant = {
  schemaVersion: 3,
  captureGrant: "G".repeat(43),
  captureContext: "SIMULATION",
  issuedAt: "2026-09-09T14:00:00.000Z",
  expiresAt: "2026-09-10T14:00:00.000Z",
  electionDate: "2026-09-20",
  votingStartDate: "2026-09-20",
  votingEndDate: "2026-09-20",
  electionWindowSha256: "e".repeat(64),
  places: [
    {
      id: "puesto-kennedy-001",
      code: "110010101",
      name: "Colegio Distrital Kennedy",
      expectedTables: 20,
      sourceLocationCode: "1001",
      votingDate: "2026-09-20",
      timeZone: "America/Bogota",
      address: "Carrera 80 # 10-20",
      commune: "Kennedy",
    },
  ],
};

const E14_INPUT: OfflineE14ReportInput = {
  puestoId: "puesto-kennedy-001",
  mesa: 7,
  credentialType: "E15",
  credentialReference: "E15-BOG-001-0007",
  checkedInAt: "2026-09-09T14:55:00.000Z",
  e14FormType: "DELEGADOS",
  candidateVotes: 80,
  blankVotes: 5,
  nullVotes: 3,
  unmarkedVotes: 2,
  totalTableVotes: 200,
  hasWrittenClaim: false,
};

function e14Evidence(
  name = "mesa-7-testigo-privado.pdf",
  type = "application/pdf",
) {
  return new File(
    [new TextEncoder().encode("%PDF-1.7\nE14 private evidence")],
    name,
    { type, lastModified: FIXED_NOW.getTime() },
  );
}

async function preparedE14Queue(
  grant: OfflineE14CaptureGrant = E14_GRANT,
  file: File = e14Evidence(),
) {
  const partitionHash = await deriveOfflineVaultPartition(IDENTITY);
  const store = new MemoryVaultStore(partitionHash);
  const session = await createOfflineVaultSession(
    store,
    IDENTITY,
    PASSPHRASE,
    FIXED_NOW,
  );
  await provisionOfflineE14Grant(session, grant, FIXED_NOW);
  const operationId = await enqueueOfflineE14(
    session,
    E14_INPUT,
    file,
    CAPTURED_AT,
    FIXED_NOW,
  );
  return { operationId, partitionHash, session, store, file };
}

function e14ReceiptFor(
  operationId: string,
  status: OfflineE14SyncReceipt["status"] = "APPLIED",
  captureContext: OfflineE14SyncReceipt["captureContext"] = "SIMULATION",
): OfflineE14SyncReceipt {
  return {
    received: true,
    receiptId: "receipt-" + operationId,
    clientOperationId: operationId,
    operationType: "E14_REPORT",
    status,
    capturedAt: CAPTURED_AT,
    receivedAt: "2026-09-09T15:01:00.000Z",
    captureContext,
  };
}

function e14Authorization(
  file: File,
  sha256: string,
  suffix = "22222222-2222-4222-8222-222222222222",
) {
  return {
    bucket: "private-evidence",
    path: IDENTITY.tenantId + "/e14/" + suffix + ".pdf",
    uploadUrl: "https://storage.example.test/upload/" + suffix,
    uploadToken: "signed-upload-token-that-must-remain-ephemeral",
    method: "PUT" as const,
    headers: { "Content-Type": file.type },
    metadata: {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      contentSha256: sha256,
    },
  };
}

test("solicita persistencia desde el gesto y distingue concesión, rechazo y soporte", async () => {
  let persistCalls = 0;
  const grantedStorage = {
    persist: async () => {
      persistCalls += 1;
      return true;
    },
    persisted: async () => false,
  };

  await expect(
    requestOfflineVaultStoragePersistence(grantedStorage),
  ).resolves.toBe("GRANTED");
  expect(persistCalls).toBe(1);
  await expect(
    requestOfflineVaultStoragePersistence({
      ...grantedStorage,
      persist: async () => false,
    }),
  ).resolves.toBe("NOT_GRANTED");
  await expect(requestOfflineVaultStoragePersistence(undefined)).resolves.toBe(
    "UNSUPPORTED",
  );
});

test("inspecciona persistencia al desbloquear sin volver a solicitar permiso", async () => {
  let requestCalls = 0;
  await expect(
    inspectOfflineVaultStoragePersistence({
      persist: async () => {
        requestCalls += 1;
        return true;
      },
      persisted: async () => true,
    }),
  ).resolves.toBe("GRANTED");
  expect(requestCalls).toBe(0);
  await expect(
    inspectOfflineVaultStoragePersistence({
      persist: async () => true,
      persisted: async () => {
        throw new Error("storage manager unavailable");
      },
    }),
  ).resolves.toBe("NOT_GRANTED");
});

test("cifra cada registro con clave no extraíble y no persiste PII, frase ni JWT", async () => {
  const { operationId, session, store } = await preparedQueue();
  expect(session.passwordKey.extractable).toBe(false);
  expect(session.passwordKey.algorithm.name).toBe("PBKDF2");

  await enqueueOfflineVoter(
    session,
    { ...VOTER_INPUT, documentId: "1032456790" },
    CAPTURED_AT,
    FIXED_NOW,
  );
  const rawRecords = store.rawRecords();
  const serialized = JSON.stringify(rawRecords);
  for (const forbidden of [
    VOTER_INPUT.documentId,
    VOTER_INPUT.firstName,
    VOTER_INPUT.lastName,
    VOTER_INPUT.email!,
    VOTER_INPUT.phone!,
    CAPTURE_CONTEXT.puestos[0].name,
    CAPTURE_CONTEXT.consentNotice!.content,
    PASSPHRASE,
    "accessToken",
    "refreshToken",
    "Authorization",
    "eyJhbGciOiJIUzI1NiJ9",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }

  for (const record of rawRecords) {
    expect(Object.keys(record).sort()).toEqual(
      [
        "attempts",
        "capturedAt",
        "ciphertext",
        "createdAt",
        "id",
        "iv",
        "lastAttemptAt",
        "nextAttemptAt",
        "salt",
        "state",
        "type",
        "updatedAt",
        "version",
      ].sort(),
    );
  }

  const voterRecords = rawRecords.filter(
    (record) => record.type === "VOTER_CAPTURE",
  );
  expect(voterRecords).toHaveLength(2);
  expect(voterRecords[0].id).toBe(operationId);
  expect(voterRecords[0].salt).not.toBe(voterRecords[1].salt);
  expect(voterRecords[0].iv).not.toBe(voterRecords[1].iv);
});

test("AAD ata partición, tipo, operación, versión y metadata mutable", async () => {
  const { operationId, partitionHash, session, store } = await preparedQueue();
  const record = (await store.get(operationId))!;
  const otherPartition = await deriveOfflineVaultPartition(OTHER_IDENTITY);

  await expect(
    decryptOfflineVaultPayload(session.passwordKey, otherPartition, record),
  ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);

  const validOtherId = "00000000-0000-4000-8000-000000000001";
  for (const corrupted of [
    { ...record, id: validOtherId },
    { ...record, type: "E14_REPORT" as const },
    { ...record, state: "APPLIED" as const },
    { ...record, attempts: 999 },
    {
      ...record,
      ciphertext: `${record.ciphertext[0] === "A" ? "B" : "A"}${record.ciphertext.slice(1)}`,
    },
  ]) {
    await expect(
      decryptOfflineVaultPayload(session.passwordKey, partitionHash, corrupted),
    ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);
  }
});

test("desbloquea solo la partición e identidad esperadas y falla cerrado ante corrupción", async () => {
  const { partitionHash, store } = await preparedQueue();

  await expect(
    unlockOfflineVaultSession(store, PASSPHRASE, OTHER_IDENTITY),
  ).rejects.toBeInstanceOf(OfflineQueueAuthorizationError);
  await expect(
    unlockOfflineVaultSession(store, "Una frase incorrecta 2026", IDENTITY),
  ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);

  const context = store
    .rawRecords()
    .find((record) => record.type === "VAULT_CONTEXT")!;
  store.records.set(context.id, { ...context, attempts: 1 });
  await expect(
    unlockOfflineVaultSession(store, PASSPHRASE, IDENTITY),
  ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);

  expect(await deriveOfflineVaultPartition(IDENTITY)).toBe(partitionHash);
  expect(await deriveOfflineVaultPartition(OTHER_IDENTITY)).not.toBe(
    partitionHash,
  );
});

test("define una migración v0→v2 determinista e idempotente", () => {
  expect(requiredVaultUpgradeSteps(0)).toEqual([
    "CREATE_RECORD_STORE",
    "CREATE_RECORD_INDEXES",
  ]);
  expect(requiredVaultUpgradeSteps(1)).toEqual(["CREATE_RECORD_INDEXES"]);
  expect(requiredVaultUpgradeSteps(2)).toEqual([]);
  expect(() => requiredVaultUpgradeSteps(-1)).toThrow(
    OfflineVaultIntegrityError,
  );

  const createdIndexes: string[] = [];
  const indexNames = new Set<string>();
  const store = {
    indexNames: { contains: (name: string) => indexNames.has(name) },
    createIndex: (name: string) => {
      indexNames.add(name);
      createdIndexes.push(name);
      return {};
    },
  };
  const database = {
    createObjectStore: () => store,
  };
  const transaction = {
    objectStore: () => store,
  };
  upgradeOfflineVaultDatabase(
    database as unknown as IDBDatabase,
    transaction as unknown as IDBTransaction,
    0,
  );
  upgradeOfflineVaultDatabase(
    database as unknown as IDBDatabase,
    transaction as unknown as IDBTransaction,
    1,
  );
  expect(createdIndexes).toEqual(["by_type", "by_state", "by_created_at"]);
});

test("serializa, conserva el id idempotente y borra la PII tras verificar el recibo", async () => {
  const { operationId, session, store } = await preparedQueue();
  const synchronizer = new OfflineQueueSynchronizer();
  const sentIds: string[] = [];
  const dependencies = {
    revalidateIdentity: async () => IDENTITY,
    sendVoter: async (
      input: CreateVoterInput & { clientOperationId: string },
    ) => {
      sentIds.push(input.clientOperationId);
      await Promise.resolve();
      return receiptFor(input.clientOperationId, "DUPLICATE");
    },
    now: () => FIXED_NOW.getTime(),
  };

  const first = synchronizer.synchronize(session, dependencies);
  const concurrent = synchronizer.synchronize(session, dependencies);
  expect(concurrent).toBe(first);
  await expect(first).resolves.toEqual({
    applied: 1,
    conflicts: 0,
    failed: 0,
    deferred: 0,
  });
  expect(sentIds).toEqual([operationId]);

  await synchronizer.synchronize(session, dependencies);
  expect(sentIds).toEqual([operationId]);
  await expect(listOfflineQueue(session)).resolves.toEqual([]);
  expect(store.rawRecords()).toHaveLength(1);
});

test("purga al desbloquear un APPLIED legado solo después de validar su recibo", async () => {
  const { operationId, partitionHash, session, store } = await preparedQueue();
  const pending = (await store.get(operationId))!;
  const decrypted = await decryptOfflineVaultPayload(
    session.passwordKey,
    partitionHash,
    pending,
  );
  expect(decrypted).toBeTruthy();
  const metadata = {
    id: pending.id,
    type: pending.type,
    state: "APPLIED" as const,
    createdAt: pending.createdAt,
    updatedAt: "2026-09-09T15:01:00.000Z",
    capturedAt: pending.capturedAt,
    lastAttemptAt: "2026-09-09T15:00:00.000Z",
    nextAttemptAt: null,
    attempts: 1,
    version: pending.version,
  };
  const encrypted = await encryptOfflineVaultPayload(
    session.passwordKey,
    partitionHash,
    metadata,
    {
      ...(decrypted as Record<string, unknown>),
      receipt: receiptFor(operationId),
    },
  );
  store.records.set(
    operationId,
    validateStoredRecord({ ...metadata, ...encrypted }),
  );

  await unlockOfflineVaultSession(store, PASSPHRASE, IDENTITY);
  expect(store.rawRecords()).toHaveLength(1);
  expect(store.rawRecords()[0].type).toBe("VAULT_CONTEXT");
});

test("rechaza un recibo para otra operación y conserva la captura para reintento", async () => {
  const queue = await preparedQueue();
  await expect(
    new OfflineQueueSynchronizer().synchronize(queue.session, {
      revalidateIdentity: async () => IDENTITY,
      sendVoter: async () => receiptFor("00000000-0000-4000-8000-000000000099"),
      now: () => FIXED_NOW.getTime(),
    }),
  ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);
  expect(await listOfflineQueue(queue.session)).toMatchObject([
    { id: queue.operationId, state: "PENDING", attempts: 0 },
  ]);
});

test("aplica backoff sin reenvío prematuro y conserva un conflicto 409", async () => {
  const networkQueue = await preparedQueue();
  const networkSynchronizer = new OfflineQueueSynchronizer();
  let networkCalls = 0;
  const networkDependencies = {
    revalidateIdentity: async () => IDENTITY,
    sendVoter: async () => {
      networkCalls += 1;
      throw Object.assign(new Error("network"), { status: 0 });
    },
    now: () => FIXED_NOW.getTime(),
  };
  await expect(
    networkSynchronizer.synchronize(networkQueue.session, networkDependencies),
  ).resolves.toMatchObject({ deferred: 1 });
  await networkSynchronizer.synchronize(
    networkQueue.session,
    networkDependencies,
  );
  expect(networkCalls).toBe(1);
  expect(await listOfflineQueue(networkQueue.session)).toMatchObject([
    {
      state: "PENDING",
      attempts: 1,
      nextAttemptAt: new Date(
        FIXED_NOW.getTime() + offlineSyncBackoffMilliseconds(1),
      ).toISOString(),
      lastError: { code: "NETWORK" },
    },
  ]);

  const conflictQueue = await preparedQueue();
  const conflictSynchronizer = new OfflineQueueSynchronizer();
  await conflictSynchronizer.synchronize(conflictQueue.session, {
    revalidateIdentity: async () => IDENTITY,
    sendVoter: async () => {
      throw Object.assign(new Error("conflict"), { status: 409 });
    },
    now: () => FIXED_NOW.getTime(),
  });
  expect(await listOfflineQueue(conflictQueue.session)).toMatchObject([
    {
      id: conflictQueue.operationId,
      state: "CONFLICT",
      attempts: 1,
      lastError: { code: "CONFLICT" },
    },
  ]);
  expect(conflictQueue.store.rawRecords()).toHaveLength(2);
});

test("bloquea por identidad/401 antes de perder o enviar operaciones", async () => {
  const mismatchQueue = await preparedQueue();
  let sendCalls = 0;
  await expect(
    new OfflineQueueSynchronizer().synchronize(mismatchQueue.session, {
      revalidateIdentity: async () => OTHER_IDENTITY,
      sendVoter: async () => {
        sendCalls += 1;
        return receiptFor(mismatchQueue.operationId);
      },
    }),
  ).rejects.toBeInstanceOf(OfflineQueueAuthorizationError);
  expect(sendCalls).toBe(0);
  expect(await listOfflineQueue(mismatchQueue.session)).toMatchObject([
    { id: mismatchQueue.operationId, state: "PENDING", attempts: 0 },
  ]);

  const unauthorizedQueue = await preparedQueue();
  await expect(
    new OfflineQueueSynchronizer().synchronize(unauthorizedQueue.session, {
      revalidateIdentity: async () => {
        throw Object.assign(new Error("unauthorized"), { status: 401 });
      },
      sendVoter: async () => receiptFor(unauthorizedQueue.operationId),
    }),
  ).rejects.toBeInstanceOf(OfflineQueueAuthorizationError);
  expect(await listOfflineQueue(unauthorizedQueue.session)).toMatchObject([
    { id: unauthorizedQueue.operationId, state: "PENDING", attempts: 0 },
  ]);
});

test("al perder primer plano cancela y devuelve la operación a PENDING", async () => {
  const queue = await preparedQueue();
  await expect(
    new OfflineQueueSynchronizer().synchronize(queue.session, {
      revalidateIdentity: async () => IDENTITY,
      sendVoter: async () => {
        throw new OfflineQueueForegroundRequiredError();
      },
      now: () => FIXED_NOW.getTime(),
    }),
  ).rejects.toBeInstanceOf(OfflineQueueForegroundRequiredError);
  expect(await listOfflineQueue(queue.session)).toMatchObject([
    {
      id: queue.operationId,
      state: "PENDING",
      attempts: 0,
      nextAttemptAt: null,
    },
  ]);
});

test("un 4xx queda FAILED, solo se reintenta explícitamente y borrar es definitivo", async () => {
  const queue = await preparedQueue();
  await new OfflineQueueSynchronizer().synchronize(queue.session, {
    revalidateIdentity: async () => IDENTITY,
    sendVoter: async () => {
      throw Object.assign(new Error("validation"), { status: 422 });
    },
    now: () => FIXED_NOW.getTime(),
  });
  expect(await listOfflineQueue(queue.session)).toMatchObject([
    {
      id: queue.operationId,
      state: "FAILED",
      attempts: 1,
      lastError: { code: "VALIDATION" },
    },
  ]);

  await retryFailedOfflineQueueRecord(
    queue.session,
    queue.operationId,
    new Date(FIXED_NOW.getTime() + 1_000),
  );
  expect(await listOfflineQueue(queue.session)).toMatchObject([
    { id: queue.operationId, state: "PENDING", lastError: null },
  ]);

  await deleteOfflineQueueRecord(queue.session, queue.operationId);
  expect(await listOfflineQueue(queue.session)).toEqual([]);
  expect(queue.store.rawRecords()).toHaveLength(1);
});

test("el código de bóveda y worker no usa tokens, storage en claro ni Background Sync", () => {
  const webDirectory = resolve(process.cwd(), "apps/web");
  const vaultSource = readFileSync(
    resolve(webDirectory, "lib/offline-vault.ts"),
    "utf8",
  );
  const providerSource = readFileSync(
    resolve(webDirectory, "context/offline-vault.tsx"),
    "utf8",
  );
  const workerSource = readFileSync(
    resolve(webDirectory, "public/sw.js"),
    "utf8",
  );

  const vaultImplementation = `${vaultSource}\n${providerSource}`;
  expect(vaultImplementation).not.toMatch(
    /\b(?:localStorage|sessionStorage|accessToken|refreshToken)\b/,
  );
  expect(vaultImplementation).not.toContain('"Authorization"');
  expect(vaultImplementation).not.toContain("'Authorization'");
  expect(workerSource).not.toMatch(
    /indexedDB|SyncManager|syncOfflineVoter|logistics\/sync\/voter|Authorization/,
  );
  expect(workerSource).toContain('url.pathname.startsWith("/api/")');
  expect(workerSource.indexOf('url.pathname.startsWith("/api/")')).toBeLessThan(
    workerSource.indexOf('if (request.mode === "navigate")'),
  );
  expect(providerSource).toContain('document.visibilityState === "hidden"');
  expect(providerSource).toContain(
    'document.addEventListener("visibilitychange"',
  );
});

test("guarda y lee solo la vista territorial exacta dentro del contexto cifrado", async () => {
  const { session, store } = await preparedQueue();
  const response = heatmapResponse();
  const snapshot = await saveOfflineHeatmapSnapshot(
    session,
    HEATMAP_QUERY,
    response,
    new Date("2026-09-09T15:05:00.000Z"),
  );

  await expect(
    readOfflineHeatmapSnapshot(session, HEATMAP_QUERY),
  ).resolves.toEqual(snapshot);
  await expect(
    readOfflineHeatmapSnapshot(session, {
      ...HEATMAP_QUERY,
      metric: "OPEN_CASES",
    }),
  ).resolves.toBeNull();
  await expect(listOfflineHeatmapSnapshots(session)).resolves.toEqual([
    snapshot,
  ]);

  const serialized = JSON.stringify(store.rawRecords());
  for (const forbidden of [
    "territorio-0000",
    "Territorio 0",
    "Indicador territorial",
    "65 %",
    "expectedTables",
    "acceptedTables",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
});

test("rechaza PII extra antes de cifrar y después de descifrar", async () => {
  const preEncryption = await preparedQueue();
  const responseWithPii = {
    ...heatmapResponse(),
    actorIds: ["user-sensitive-1"],
  };
  await expect(
    saveOfflineHeatmapSnapshot(
      preEncryption.session,
      HEATMAP_QUERY,
      responseWithPii as TerritoryHeatmapResponse,
    ),
  ).rejects.toThrow(/contrato seguro/);

  const tampered = await preparedQueue();
  await saveOfflineHeatmapSnapshot(
    tampered.session,
    HEATMAP_QUERY,
    heatmapResponse(),
  );
  const context = tampered.store
    .rawRecords()
    .find((record) => record.type === "VAULT_CONTEXT")!;
  const plaintext = (await decryptOfflineVaultPayload(
    tampered.session.passwordKey,
    tampered.partitionHash,
    context,
  )) as Record<string, unknown>;
  const snapshots = plaintext.heatmapSnapshots as Array<
    Record<string, unknown>
  >;
  const storedResponse = snapshots[0].response as Record<string, unknown>;
  (storedResponse.items as Array<Record<string, unknown>>)[0].actorName =
    "Persona sensible";
  const metadata = {
    id: context.id,
    type: context.type,
    state: context.state,
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
    capturedAt: context.capturedAt,
    lastAttemptAt: context.lastAttemptAt,
    nextAttemptAt: context.nextAttemptAt,
    attempts: context.attempts,
    version: context.version,
  };
  const encrypted = await encryptOfflineVaultPayload(
    tampered.session.passwordKey,
    tampered.partitionHash,
    metadata,
    plaintext,
  );
  tampered.store.records.set(
    context.id,
    validateStoredRecord({ ...metadata, ...encrypted }),
  );

  await expect(
    readOfflineHeatmapSnapshot(tampered.session, HEATMAP_QUERY),
  ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);
});

test("el snapshot territorial queda aislado por tenant y usuario", async () => {
  const { session } = await preparedQueue();
  await saveOfflineHeatmapSnapshot(session, HEATMAP_QUERY, heatmapResponse());
  const forgedSession = { ...session, identity: OTHER_IDENTITY };

  await expect(
    readOfflineHeatmapSnapshot(forgedSession, HEATMAP_QUERY),
  ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);
  await expect(
    listOfflineHeatmapSnapshots(forgedSession),
  ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);
});

test("lista snapshots para el visor offline en orden reciente y estable", async () => {
  const { session } = await preparedQueue();
  const olderQuery: TerritoryHeatmapQuery = {
    level: "MUNICIPIO",
    metric: "OPEN_CASES",
    parentId: "departamento-05",
  };
  const older = await saveOfflineHeatmapSnapshot(
    session,
    olderQuery,
    heatmapResponse(olderQuery),
    new Date("2026-09-09T14:00:00.000Z"),
  );
  const newer = await saveOfflineHeatmapSnapshot(
    session,
    HEATMAP_QUERY,
    heatmapResponse(),
    new Date("2026-09-09T15:00:00.000Z"),
  );

  await expect(listOfflineHeatmapSnapshots(session)).resolves.toEqual([
    newer,
    older,
  ]);
});

test("poda snapshots por antigüedad y clave de forma determinista", () => {
  const snapshots = Array.from(
    { length: OFFLINE_HEATMAP_MAX_SNAPSHOTS + 2 },
    (_, index) =>
      heatmapSnapshot(
        {
          level: "MUNICIPIO",
          metric: "OPEN_CASES",
          parentId: `parent-${String(index).padStart(2, "0")}`,
        },
        "2026-09-09T15:00:00.000Z",
      ),
  ).reverse();

  const pruned = pruneOfflineHeatmapSnapshots(snapshots);
  expect(pruned).toHaveLength(OFFLINE_HEATMAP_MAX_SNAPSHOTS);
  expect(pruned.map((snapshot) => snapshot.query.parentId)).toEqual(
    Array.from(
      { length: OFFLINE_HEATMAP_MAX_SNAPSHOTS },
      (_, index) => `parent-${String(index + 2).padStart(2, "0")}`,
    ),
  );
});

test("aplica límites por snapshot y capacidad total antes de cifrar", () => {
  const oversized = heatmapSnapshot(
    HEATMAP_QUERY,
    "2026-09-09T15:00:00.000Z",
    500,
    1,
  );
  expect(
    new TextEncoder().encode(JSON.stringify(oversized)).byteLength,
  ).toBeGreaterThan(OFFLINE_HEATMAP_MAX_SNAPSHOT_BYTES);
  expect(() => pruneOfflineHeatmapSnapshots([oversized])).toThrow(
    /tamaño máximo/,
  );

  const largeSnapshots = Array.from({ length: 8 }, (_, index) =>
    heatmapSnapshot(
      {
        level: "MUNICIPIO",
        metric: "TEAM_COVERAGE",
        parentId: `capacity-${index}`,
      },
      new Date(Date.UTC(2026, 8, 9, 15, index)).toISOString(),
      220,
      1,
    ),
  );
  const pruned = pruneOfflineHeatmapSnapshots(largeSnapshots);
  const totalBytes = pruned.reduce(
    (total, snapshot) =>
      total + new TextEncoder().encode(JSON.stringify(snapshot)).byteLength,
    0,
  );
  expect(pruned.length).toBeLessThan(largeSnapshots.length);
  expect(totalBytes).toBeLessThanOrEqual(OFFLINE_HEATMAP_MAX_TOTAL_BYTES);
});

test("mantiene lectura segura de un contexto lógico v1 sin snapshots", async () => {
  const { partitionHash, session, store } = await preparedQueue();
  const context = store
    .rawRecords()
    .find((record) => record.type === "VAULT_CONTEXT")!;
  const current = (await decryptOfflineVaultPayload(
    session.passwordKey,
    partitionHash,
    context,
  )) as Record<string, unknown>;
  const legacy = {
    kind: current.kind,
    schemaVersion: 1,
    identity: current.identity,
    captureContext: current.captureContext,
    provisionedAt: current.provisionedAt,
  };
  const metadata = {
    id: context.id,
    type: context.type,
    state: context.state,
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
    capturedAt: context.capturedAt,
    lastAttemptAt: context.lastAttemptAt,
    nextAttemptAt: context.nextAttemptAt,
    attempts: context.attempts,
    version: context.version,
  };
  const encrypted = await encryptOfflineVaultPayload(
    session.passwordKey,
    partitionHash,
    metadata,
    legacy,
  );
  store.records.set(
    context.id,
    validateStoredRecord({ ...metadata, ...encrypted }),
  );

  const unlocked = await unlockOfflineVaultSession(store, PASSPHRASE, IDENTITY);
  await expect(
    readOfflineHeatmapSnapshot(unlocked, HEATMAP_QUERY),
  ).resolves.toBeNull();
});

test("E-14 cifra grant, nombre y bytes; expone solo un resumen tenant+usuario", async () => {
  const { operationId, session, store, file } = await preparedE14Queue();
  const serialized = JSON.stringify(store.rawRecords());

  expect(serialized).not.toContain(E14_GRANT.captureGrant);
  expect(serialized).not.toContain(file.name);
  expect(serialized).not.toContain("%PDF");
  expect(serialized).not.toContain("signed-upload-token");
  await expect(listOfflineQueue(session)).resolves.toEqual([
    expect.objectContaining({
      id: operationId,
      type: "E14_REPORT",
      state: "PENDING",
      captureContext: "SIMULATION",
      evidenceBytes: file.size,
    }),
  ]);

  await expect(
    listOfflineQueue({ ...session, identity: OTHER_IDENTITY }),
  ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);
});

test("E-14 rechaza extensión, MIME, firma, tamaño, mesa, vigencia y cuota antes de persistir", async () => {
  const partitionHash = await deriveOfflineVaultPartition(IDENTITY);
  const store = new MemoryVaultStore(partitionHash);
  const session = await createOfflineVaultSession(
    store,
    IDENTITY,
    PASSPHRASE,
    FIXED_NOW,
  );
  await provisionOfflineE14Grant(session, E14_GRANT, FIXED_NOW);

  await expect(
    enqueueOfflineE14(
      session,
      E14_INPUT,
      e14Evidence("acta.txt"),
      CAPTURED_AT,
      FIXED_NOW,
    ),
  ).rejects.toThrow(/JPG.*PDF/i);
  await expect(
    enqueueOfflineE14(
      session,
      E14_INPUT,
      e14Evidence("acta.pdf", "image/png"),
      CAPTURED_AT,
      FIXED_NOW,
    ),
  ).rejects.toThrow(/JPG.*PDF/i);
  await expect(
    enqueueOfflineE14(
      session,
      E14_INPUT,
      new File(["not a pdf"], "acta.pdf", { type: "application/pdf" }),
      CAPTURED_AT,
      FIXED_NOW,
    ),
  ).rejects.toThrow(/contenido|firma/i);
  const oversized = new File(
    [new Uint8Array(OFFLINE_E14_MAX_FILE_BYTES + 1)],
    "acta.pdf",
    { type: "application/pdf" },
  );
  await expect(
    enqueueOfflineE14(session, E14_INPUT, oversized, CAPTURED_AT, FIXED_NOW),
  ).rejects.toThrow(/15 MiB/i);
  await expect(
    enqueueOfflineE14(
      session,
      { ...E14_INPUT, mesa: 21 },
      e14Evidence(),
      CAPTURED_AT,
      FIXED_NOW,
    ),
  ).rejects.toThrow(/vigencia.*puesto.*mesas/i);

  for (let index = 0; index < OFFLINE_E14_MAX_QUEUE_ENTRIES; index += 1) {
    await enqueueOfflineE14(
      session,
      { ...E14_INPUT, mesa: index + 1 },
      e14Evidence("acta-" + index + ".pdf"),
      CAPTURED_AT,
      FIXED_NOW,
    );
  }
  await expect(
    enqueueOfflineE14(
      session,
      { ...E14_INPUT, mesa: 10 },
      e14Evidence("quinta.pdf"),
      CAPTURED_AT,
      FIXED_NOW,
    ),
  ).rejects.toThrow(/limite de 4 actas o 30 MiB/i);
  expect(
    (await store.list()).filter((record) => record.type === "E14_REPORT"),
  ).toHaveLength(OFFLINE_E14_MAX_QUEUE_ENTRIES);

  const expiredStore = new MemoryVaultStore(partitionHash);
  const expiredSession = await createOfflineVaultSession(
    expiredStore,
    IDENTITY,
    PASSPHRASE,
    FIXED_NOW,
  );
  await provisionOfflineE14Grant(
    expiredSession,
    {
      ...E14_GRANT,
      issuedAt: "2026-09-08T12:00:00.000Z",
      expiresAt: "2026-09-09T14:59:59.000Z",
    },
    new Date("2026-09-09T14:59:58.000Z"),
  );
  await expect(
    enqueueOfflineE14(
      expiredSession,
      E14_INPUT,
      e14Evidence(),
      CAPTURED_AT,
      FIXED_NOW,
    ),
  ).rejects.toThrow(/vigencia/i);
});

test("E-14 REAL exige fecha local exacta y zona IANA verificable en grant y cola", async () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  const realGrant: OfflineE14CaptureGrant = {
    ...E14_GRANT,
    captureContext: "REAL",
    issuedAt: "2026-09-20T11:00:00.000Z",
    expiresAt: "2026-09-21T13:00:00.000Z",
  };
  const partitionHash = await deriveOfflineVaultPartition(IDENTITY);
  const session = await createOfflineVaultSession(
    new MemoryVaultStore(partitionHash),
    IDENTITY,
    PASSPHRASE,
    now,
  );
  await provisionOfflineE14Grant(session, realGrant, now);

  await expect(
    enqueueOfflineE14(
      session,
      {
        ...E14_INPUT,
        checkedInAt: "2026-09-20T11:55:00.000Z",
      },
      e14Evidence(),
      "2026-09-20T12:00:00.000Z",
      now,
    ),
  ).resolves.toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await expect(
    enqueueOfflineE14(
      session,
      {
        ...E14_INPUT,
        mesa: 8,
        checkedInAt: "2026-09-21T05:55:00.000Z",
      },
      e14Evidence("outside-day.pdf"),
      "2026-09-21T06:00:00.000Z",
      new Date("2026-09-21T06:00:00.000Z"),
    ),
  ).rejects.toThrow(/fecha local.*zona horaria/i);

  expect(() =>
    validateOfflineE14Grant({
      ...realGrant,
      places: [{ ...realGrant.places[0]!, timeZone: null }],
    }),
  ).toThrow(OfflineVaultIntegrityError);
  expect(() =>
    validateOfflineE14Grant({
      ...realGrant,
      places: [{ ...realGrant.places[0]!, timeZone: "America/Invalid" }],
    }),
  ).toThrow(OfflineVaultIntegrityError);
});

test("E-14 sincroniza en primer plano, envía binario directo y borra solo tras recibo exacto", async () => {
  const queue = await preparedE14Queue();
  const steps: string[] = [];
  const sentInputs: Array<Record<string, unknown>> = [];
  const result = await new OfflineQueueSynchronizer().synchronize(
    queue.session,
    {
      revalidateIdentity: async () => IDENTITY,
      sendVoter: async () => {
        throw new Error("unexpected voter call");
      },
      authorizeE14: async (file, sha256) => {
        steps.push("authorize");
        return e14Authorization(file, sha256);
      },
      uploadE14: async () => {
        steps.push("direct-put");
      },
      confirmE14: async (path) => {
        steps.push("confirm");
        return { confirmed: true, path, module: "e14" };
      },
      sendE14: async (input) => {
        steps.push("receipt");
        sentInputs.push(input as unknown as Record<string, unknown>);
        return e14ReceiptFor(queue.operationId);
      },
      ensureForeground: () => steps.push("foreground"),
      now: () => FIXED_NOW.getTime(),
    },
  );

  expect(result).toEqual({
    applied: 1,
    conflicts: 0,
    failed: 0,
    deferred: 0,
  });
  expect(steps.filter((step) => step !== "foreground")).toEqual([
    "authorize",
    "direct-put",
    "confirm",
    "receipt",
  ]);
  expect(sentInputs).toHaveLength(1);
  expect(sentInputs[0]).toMatchObject({
    clientOperationId: queue.operationId,
    capturedAt: CAPTURED_AT,
    captureGrant: E14_GRANT.captureGrant,
    e14ImageUrl:
      IDENTITY.tenantId + "/e14/22222222-2222-4222-8222-222222222222.pdf",
  });
  expect(sentInputs[0]).not.toHaveProperty("captureContext");
  expect(sentInputs[0].evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(queue.store.rawRecords()).toHaveLength(1);
});

test("reanuda después de caída durante PUT mediante path cifrado, sin persistir URL o token", async () => {
  const queue = await preparedE14Queue();
  let authorizationCalls = 0;
  let uploadCalls = 0;
  let confirmationCalls = 0;
  const authorization = async (file: File, sha256: string) => {
    authorizationCalls += 1;
    return e14Authorization(file, sha256);
  };
  const firstNow = FIXED_NOW.getTime();
  const synchronizer = new OfflineQueueSynchronizer();

  await expect(
    synchronizer.synchronize(queue.session, {
      revalidateIdentity: async () => IDENTITY,
      sendVoter: async () => {
        throw new Error("unexpected voter call");
      },
      authorizeE14: authorization,
      uploadE14: async () => {
        uploadCalls += 1;
        throw Object.assign(new Error("connection lost after PUT"), {
          status: 0,
        });
      },
      confirmE14: async (path) => {
        confirmationCalls += 1;
        return { confirmed: true, path, module: "e14" };
      },
      sendE14: async () => e14ReceiptFor(queue.operationId),
      now: () => firstNow,
    }),
  ).resolves.toMatchObject({ deferred: 1 });

  const persisted = JSON.stringify(queue.store.rawRecords());
  expect(persisted).not.toContain("https://storage.example.test");
  expect(persisted).not.toContain("signed-upload-token");
  expect(persisted).not.toContain(queue.file.name);

  await expect(
    synchronizer.synchronize(queue.session, {
      revalidateIdentity: async () => IDENTITY,
      sendVoter: async () => {
        throw new Error("unexpected voter call");
      },
      authorizeE14: authorization,
      uploadE14: async () => {
        uploadCalls += 1;
      },
      confirmE14: async (path) => {
        confirmationCalls += 1;
        return { confirmed: true, path, module: "e14" };
      },
      sendE14: async () => e14ReceiptFor(queue.operationId, "DUPLICATE"),
      now: () => firstNow + offlineSyncBackoffMilliseconds(1) + 1,
    }),
  ).resolves.toMatchObject({ applied: 1 });
  expect(authorizationCalls).toBe(1);
  expect(uploadCalls).toBe(1);
  expect(confirmationCalls).toBe(1);
  expect(queue.store.rawRecords()).toHaveLength(1);
});

test("conserva evidencia tras respuesta perdida y acepta solo DUPLICATE del mismo contexto", async () => {
  const queue = await preparedE14Queue();
  const firstNow = FIXED_NOW.getTime();
  let sendCalls = 0;
  const synchronizer = new OfflineQueueSynchronizer();
  const common = {
    revalidateIdentity: async () => IDENTITY,
    sendVoter: async () => {
      throw new Error("unexpected voter call");
    },
    authorizeE14: async (file: File, sha256: string) =>
      e14Authorization(file, sha256),
    uploadE14: async () => undefined,
    confirmE14: async (path: string) => ({
      confirmed: true as const,
      path,
      module: "e14" as const,
    }),
  };

  await synchronizer.synchronize(queue.session, {
    ...common,
    sendE14: async () => {
      sendCalls += 1;
      throw Object.assign(new Error("response lost after commit"), {
        status: 0,
      });
    },
    now: () => firstNow,
  });
  expect(queue.store.rawRecords()).toHaveLength(2);

  await synchronizer.synchronize(queue.session, {
    ...common,
    sendE14: async () => {
      sendCalls += 1;
      return e14ReceiptFor(queue.operationId, "DUPLICATE", "SIMULATION");
    },
    now: () => firstNow + offlineSyncBackoffMilliseconds(1) + 1,
  });
  expect(sendCalls).toBe(2);
  expect(queue.store.rawRecords()).toHaveLength(1);

  const mismatch = await preparedE14Queue();
  await expect(
    new OfflineQueueSynchronizer().synchronize(mismatch.session, {
      ...common,
      sendE14: async () =>
        e14ReceiptFor(mismatch.operationId, "APPLIED", "REAL"),
      now: () => firstNow,
    }),
  ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);
  await expect(listOfflineQueue(mismatch.session)).resolves.toMatchObject([
    { id: mismatch.operationId, state: "PENDING" },
  ]);
});

test("detecta alteración profunda de hash o bytes después de descifrar", async () => {
  const queue = await preparedE14Queue();
  const record = (await queue.store.get(queue.operationId))!;
  const plaintext = (await decryptOfflineVaultPayload(
    queue.session.passwordKey,
    queue.partitionHash,
    record,
  )) as Record<string, unknown>;
  (plaintext.file as Record<string, unknown>).sha256 = "f".repeat(64);
  const metadata = {
    id: record.id,
    type: record.type,
    state: record.state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    capturedAt: record.capturedAt,
    lastAttemptAt: record.lastAttemptAt,
    nextAttemptAt: record.nextAttemptAt,
    attempts: record.attempts,
    version: record.version,
  };
  const encrypted = await encryptOfflineVaultPayload(
    queue.session.passwordKey,
    queue.partitionHash,
    metadata,
    plaintext,
  );
  queue.store.records.set(
    record.id,
    validateStoredRecord({ ...metadata, ...encrypted }),
  );

  await expect(listOfflineQueue(queue.session)).rejects.toBeInstanceOf(
    OfflineVaultIntegrityError,
  );
});

const INCIDENT_CONTEXT: OfflineIncidentCaptureContext = {
  schemaVersion: 1,
  provisionedAt: FIXED_NOW.toISOString(),
  stage: "CAMPAIGN",
  requiresTerritory: true,
  categories: [
    "SECURITY",
    "LOGISTICS",
    "ELECTORAL_MATERIAL",
    "ACCESSIBILITY",
    "PUBLIC_ORDER",
    "TECHNOLOGY",
    "COMPLIANCE",
    "OTHER",
  ],
  priorities: ["LOW", "MEDIUM", "HIGH", "URGENT"],
  territories: [
    {
      id: "zona-kennedy",
      code: "11-08",
      name: "Kennedy",
      type: "ZONA",
    },
  ],
};

const INCIDENT_INPUT: OfflineIncidentInput = {
  category: "LOGISTICS",
  priority: "HIGH",
  title: "Falta material operativo",
  description: "El punto reporta faltante del insumo operativo previsto.",
  occurredOn: "2026-09-09",
  divisionId: "zona-kennedy",
};

async function preparedIncidentQueue() {
  const partitionHash = await deriveOfflineVaultPartition(IDENTITY);
  const store = new MemoryVaultStore(partitionHash);
  const session = await createOfflineVaultSession(
    store,
    IDENTITY,
    PASSPHRASE,
    FIXED_NOW,
  );
  await provisionOfflineIncidentContext(session, INCIDENT_CONTEXT, FIXED_NOW);
  const operationId = await enqueueOfflineIncident(
    session,
    INCIDENT_INPUT,
    CAPTURED_AT,
    FIXED_NOW,
  );
  return { operationId, partitionHash, session, store };
}

test("incidente offline conserva estado/conflicto y sólo se elimina tras un recibo SHA válido", async () => {
  const queue = await preparedIncidentQueue();
  let sentHash = "";
  await expect(
    new OfflineQueueSynchronizer().synchronize(queue.session, {
      revalidateIdentity: async () => IDENTITY,
      sendVoter: async () => {
        throw new Error("ruta incorrecta");
      },
      sendIncident: async (input): Promise<OfflineIncidentSyncReceipt> => {
        sentHash = input.payloadSha256;
        return {
          received: true,
          receiptId: `receipt-${input.clientOperationId}`,
          clientOperationId: input.clientOperationId,
          operationType: "INCIDENT_REPORT",
          status: "DUPLICATE",
          capturedAt: input.capturedAt,
          receivedAt: "2026-09-09T15:01:00.000Z",
          payloadSha256: input.payloadSha256,
        };
      },
      now: () => FIXED_NOW.getTime(),
    }),
  ).resolves.toEqual({ applied: 1, conflicts: 0, failed: 0, deferred: 0 });
  expect(sentHash).toMatch(/^[a-f0-9]{64}$/);
  await expect(listOfflineQueue(queue.session)).resolves.toEqual([]);
  expect(queue.store.rawRecords()).toHaveLength(1);

  const conflict = await preparedIncidentQueue();
  await new OfflineQueueSynchronizer().synchronize(conflict.session, {
    revalidateIdentity: async () => IDENTITY,
    sendVoter: async () => {
      throw new Error("ruta incorrecta");
    },
    sendIncident: async () => {
      throw Object.assign(new Error("contenido distinto"), { status: 409 });
    },
    now: () => FIXED_NOW.getTime(),
  });
  await expect(listOfflineQueue(conflict.session)).resolves.toMatchObject([
    {
      type: "INCIDENT_REPORT",
      state: "CONFLICT",
      attempts: 1,
      lastError: { code: "CONFLICT" },
    },
  ]);
});

test("cold-start recupera contexto de incidente y calendario ACTIVE cifrado de solo lectura", async () => {
  const partitionHash = await deriveOfflineVaultPartition(IDENTITY);
  const store = new MemoryVaultStore(partitionHash);
  const session = await createOfflineVaultSession(
    store,
    IDENTITY,
    PASSPHRASE,
    FIXED_NOW,
  );
  await provisionOfflineIncidentContext(session, INCIDENT_CONTEXT, FIXED_NOW);
  const snapshot: OfflineElectoralCalendarSnapshot = {
    schemaVersion: 1,
    readOnly: true,
    releaseId: "release-active-2026",
    versionLabel: "RNEC-v3",
    roundCode: "UNICA",
    sourceSha256: "d".repeat(64),
    sourceCutoffAt: "2026-09-09T13:00:00.000Z",
    timeZone: "America/Bogota",
    savedAt: FIXED_NOW.toISOString(),
    milestones: [
      {
        id: "milestone-election-day",
        stableKey: "election-day",
        title: "Jornada electoral",
        category: "ELECTION_DAY",
        semantics: "EXTERNAL_DEADLINE",
        localDate: "2026-10-25",
        localTime: "08:00",
        timeZone: "America/Bogota",
        responsibleName: "Coordinación operativa",
        backupName: "Suplencia operativa",
      },
    ],
  };
  await saveOfflineCalendarSnapshot(session, snapshot, FIXED_NOW);

  const coldSession = await unlockOfflineVaultSession(
    store,
    PASSPHRASE,
    IDENTITY,
  );
  await expect(readOfflineIncidentContext(coldSession)).resolves.toEqual(
    INCIDENT_CONTEXT,
  );
  await expect(readOfflineCalendarSnapshot(coldSession)).resolves.toEqual(
    snapshot,
  );
  expect(JSON.stringify(store.rawRecords())).not.toContain("Jornada electoral");
});

test("incidente rechaza campos PII extra y conserva el pendiente ante recibo con SHA ajeno", async () => {
  const partitionHash = await deriveOfflineVaultPartition(IDENTITY);
  const store = new MemoryVaultStore(partitionHash);
  const session = await createOfflineVaultSession(
    store,
    IDENTITY,
    PASSPHRASE,
    FIXED_NOW,
  );
  await provisionOfflineIncidentContext(session, INCIDENT_CONTEXT, FIXED_NOW);
  await expect(
    enqueueOfflineIncident(
      session,
      { ...INCIDENT_INPUT, documentId: "1012345678" } as OfflineIncidentInput,
      CAPTURED_AT,
      FIXED_NOW,
    ),
  ).rejects.toThrow(/contrato offline/i);
  expect(store.rawRecords()).toHaveLength(1);

  const queue = await preparedIncidentQueue();
  await expect(
    new OfflineQueueSynchronizer().synchronize(queue.session, {
      revalidateIdentity: async () => IDENTITY,
      sendVoter: async () => {
        throw new Error("ruta incorrecta");
      },
      sendIncident: async (input) => ({
        received: true,
        receiptId: `receipt-${input.clientOperationId}`,
        clientOperationId: input.clientOperationId,
        operationType: "INCIDENT_REPORT",
        status: "APPLIED",
        capturedAt: input.capturedAt,
        receivedAt: "2026-09-09T15:01:00.000Z",
        payloadSha256: "f".repeat(64),
      }),
      now: () => FIXED_NOW.getTime(),
    }),
  ).rejects.toBeInstanceOf(OfflineVaultIntegrityError);
  await expect(listOfflineQueue(queue.session)).resolves.toMatchObject([
    { type: "INCIDENT_REPORT", state: "PENDING", attempts: 0 },
  ]);
});
