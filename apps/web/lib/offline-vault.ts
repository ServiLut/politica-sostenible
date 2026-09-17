import type { VoterCaptureContext, CreateVoterInput } from "./voters-api";
import {
  validateWitnessVoteBreakdown,
  WITNESS_CHECK_IN_CLOCK_SKEW_MS,
  type ActiveWitnessCaptureContext,
  type E14FormType,
  type WitnessCredentialType,
  type WitnessReclamationGround,
} from "./election-api";
import type {
  OfflineE14CaptureGrant,
  OfflineE14ReportInput,
  OfflineE14SyncInput,
  OfflineE14SyncReceipt,
} from "./offline-e14-api";
import type { UploadAuthorization } from "./direct-storage-upload";
import {
  computeOfflineIncidentSha256,
  OFFLINE_INCIDENT_CATEGORIES,
  OFFLINE_INCIDENT_PRIORITIES,
  type OfflineIncidentCaptureContext,
  type OfflineIncidentInput,
  type OfflineIncidentSyncInput,
  type OfflineIncidentSyncReceipt,
} from "./offline-incidents-api";
import {
  territoryHeatmapSnapshotKey,
  validateTerritoryHeatmapQuery,
  validateTerritoryHeatmapResponse,
  validateTerritoryHeatmapSnapshot,
  type TerritoryHeatmapQuery,
  type TerritoryHeatmapResponse,
  type TerritoryHeatmapSnapshot,
} from "./territory-heatmap";

export const OFFLINE_VAULT_DB_VERSION = 2;
export const OFFLINE_VAULT_CRYPTO_VERSION = 1 as const;
export const OFFLINE_VAULT_PBKDF2_ITERATIONS = 310_000;
export const OFFLINE_SYNC_MAX_ATTEMPTS = 5;
export const OFFLINE_HEATMAP_MAX_SNAPSHOTS = 8;
export const OFFLINE_HEATMAP_MAX_SNAPSHOT_BYTES = 256 * 1_024;
export const OFFLINE_HEATMAP_MAX_TOTAL_BYTES = 1_024 * 1_024;
export const OFFLINE_E14_MAX_FILE_BYTES = 15 * 1_024 * 1_024;
export const OFFLINE_E14_MAX_QUEUE_ENTRIES = 4;
export const OFFLINE_E14_MAX_TOTAL_BYTES = 30 * 1_024 * 1_024;
export const OFFLINE_VAULT_OPEN_EVENT =
  "politica-sostenible:open-offline-vault";

export type OfflineVaultStoragePersistence =
  | "GRANTED"
  | "NOT_GRANTED"
  | "UNSUPPORTED";

type VaultStorageManager = Pick<StorageManager, "persist" | "persisted">;

function browserStorageManager(): VaultStorageManager | undefined {
  return typeof navigator !== "undefined" ? navigator.storage : undefined;
}

export async function requestOfflineVaultStoragePersistence(
  storage: VaultStorageManager | undefined = browserStorageManager(),
): Promise<OfflineVaultStoragePersistence> {
  if (!storage || typeof storage.persist !== "function") return "UNSUPPORTED";
  try {
    // Invoke persist before the first await so browsers that require a user
    // activation can associate the request with the explicit UI gesture.
    const granted = await storage.persist();
    return granted ? "GRANTED" : "NOT_GRANTED";
  } catch {
    return "NOT_GRANTED";
  }
}

export async function inspectOfflineVaultStoragePersistence(
  storage: VaultStorageManager | undefined = browserStorageManager(),
): Promise<OfflineVaultStoragePersistence> {
  if (!storage || typeof storage.persisted !== "function") {
    return "UNSUPPORTED";
  }
  try {
    return (await storage.persisted()) ? "GRANTED" : "NOT_GRANTED";
  } catch {
    return "NOT_GRANTED";
  }
}

const VAULT_DATABASE_PREFIX = "polsost-offline-vault-v2-";
const VAULT_CATALOG_DATABASE = "polsost-offline-vault-catalog";
const VAULT_CATALOG_VERSION = 1;
const RECORD_STORE = "records";
const CATALOG_STORE = "partitions";
const CONTEXT_TYPE = "VAULT_CONTEXT" as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PARTITION_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CAPTURE_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const STALE_SYNCING_MS = 2 * 60 * 1_000;
const MAX_CAPTURE_CONTEXT_BYTES = 256 * 1_024;
const MAX_E14_GRANT_BYTES = 2 * 1_024 * 1_024;
const MAX_INCIDENT_CONTEXT_BYTES = 512 * 1_024;
const MAX_CALENDAR_SNAPSHOT_BYTES = 1 * 1_024 * 1_024;
const MAX_VAULT_CONTEXT_BYTES =
  MAX_CAPTURE_CONTEXT_BYTES +
  OFFLINE_HEATMAP_MAX_TOTAL_BYTES +
  MAX_E14_GRANT_BYTES +
  MAX_INCIDENT_CONTEXT_BYTES +
  MAX_CALENDAR_SNAPSHOT_BYTES +
  64 * 1_024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ELECTION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_ELECTION_WINDOW_SHA256 = "0".repeat(64);
const E14_GRANT_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type OfflineQueueRecordType =
  | "VOTER_CAPTURE"
  | "E14_REPORT"
  | "INCIDENT_REPORT";
export type StoredVaultRecordType =
  | typeof CONTEXT_TYPE
  | OfflineQueueRecordType;
export type OfflineQueueRecordState =
  | "PENDING"
  | "SYNCING"
  | "CONFLICT"
  | "FAILED"
  | "APPLIED";

export interface OfflineVaultIdentity {
  tenantId: string;
  userId: string;
}

export interface StoredVaultRecord {
  id: string;
  type: StoredVaultRecordType;
  state: OfflineQueueRecordState;
  createdAt: string;
  updatedAt: string;
  capturedAt: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  attempts: number;
  ciphertext: string;
  iv: string;
  salt: string;
  version: typeof OFFLINE_VAULT_CRYPTO_VERSION;
}

export interface OfflineSyncReceipt {
  received: true;
  receiptId: string;
  clientOperationId: string;
  operationType: "VOTER_CAPTURE" | "E14_REPORT" | "INCIDENT_REPORT";
  status: "APPLIED" | "DUPLICATE";
  capturedAt: string;
  receivedAt: string;
}

export interface OfflineCalendarSnapshotMilestone {
  id: string;
  stableKey: string;
  title: string;
  category: string;
  semantics: string;
  localDate: string;
  localTime: string | null;
  timeZone: string;
  responsibleName: string | null;
  backupName: string | null;
}

export interface OfflineElectoralCalendarSnapshot {
  schemaVersion: 1;
  readOnly: true;
  releaseId: string;
  versionLabel: string;
  roundCode: string;
  sourceSha256: string;
  sourceCutoffAt: string;
  timeZone: string;
  savedAt: string;
  milestones: OfflineCalendarSnapshotMilestone[];
}

interface VaultContextPayload {
  kind: typeof CONTEXT_TYPE;
  schemaVersion: 4;
  identity: OfflineVaultIdentity;
  captureContext: VoterCaptureContext | null;
  provisionedAt: string | null;
  heatmapSnapshots: TerritoryHeatmapSnapshot[];
  e14Grant: OfflineE14CaptureGrant | null;
  incidentContext: OfflineIncidentCaptureContext | null;
  electoralCalendarSnapshot: OfflineElectoralCalendarSnapshot | null;
}

interface QueueFailure {
  code: "AUTH" | "CONFLICT" | "NETWORK" | "SERVER" | "VALIDATION";
  message: string;
  at: string;
}

interface VoterQueuePayload {
  kind: "VOTER_CAPTURE";
  schemaVersion: 1;
  clientOperationId: string;
  capturedAt: string;
  input: CreateVoterInput;
  lastError: QueueFailure | null;
  receipt: OfflineSyncReceipt | null;
}

interface E14QueueFile {
  fileName: string;
  contentType: string;
  size: number;
  sha256: string;
  bytesBase64: string;
}

interface E14QueuePayload {
  kind: "E14_REPORT";
  schemaVersion: 3;
  clientOperationId: string;
  capturedAt: string;
  captureContext: ActiveWitnessCaptureContext;
  captureGrant: string;
  grantIssuedAt: string;
  grantExpiresAt: string;
  electionDate: string;
  votingStartDate: string;
  votingEndDate: string;
  electionWindowSha256: string;
  expectedTablesAtProvision: number;
  sourceLocationCodeAtProvision: string | null;
  pollingPlaceVotingDate: string | null;
  pollingPlaceTimeZone: string | null;
  input: OfflineE14ReportInput;
  file: E14QueueFile;
  upload: { path: string | null; confirmed: boolean };
  lastError: QueueFailure | null;
  receipt: OfflineE14SyncReceipt | null;
}

interface IncidentQueuePayload {
  kind: "INCIDENT_REPORT";
  schemaVersion: 1;
  clientOperationId: string;
  capturedAt: string;
  payloadSha256: string;
  input: OfflineIncidentInput;
  lastError: QueueFailure | null;
  receipt: OfflineIncidentSyncReceipt | null;
}

type QueuePayload = VoterQueuePayload | E14QueuePayload | IncidentQueuePayload;

export interface OfflineQueueSummary {
  id: string;
  type: OfflineQueueRecordType;
  state: OfflineQueueRecordState;
  capturedAt: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: QueueFailure | null;
  captureContext?: ActiveWitnessCaptureContext;
  evidenceBytes?: number;
}

export interface OfflineVaultSession {
  readonly partitionHash: string;
  readonly identity: OfflineVaultIdentity;
  readonly passwordKey: CryptoKey;
  readonly store: VaultRecordStore;
}

export interface VaultRecordStore {
  readonly partitionHash: string;
  list(): Promise<StoredVaultRecord[]>;
  get(id: string): Promise<StoredVaultRecord | null>;
  put(record: StoredVaultRecord): Promise<void>;
  replaceIfUnchanged(
    expected: StoredVaultRecord,
    replacement: StoredVaultRecord,
  ): Promise<boolean>;
  deleteIfUnchanged(expected: StoredVaultRecord): Promise<boolean>;
}

export interface OfflineSyncDependencies {
  revalidateIdentity(): Promise<OfflineVaultIdentity>;
  sendVoter(
    input: CreateVoterInput & {
      clientOperationId: string;
      capturedAt: string;
    },
  ): Promise<OfflineSyncReceipt>;
  authorizeE14?(file: File, sha256: string): Promise<UploadAuthorization>;
  uploadE14?(file: File, authorization: UploadAuthorization): Promise<void>;
  confirmE14?(
    path: string,
    metadata: UploadAuthorization["metadata"],
  ): Promise<{ confirmed: true; path: string; module?: "e14" }>;
  sendE14?(input: OfflineE14SyncInput): Promise<OfflineE14SyncReceipt>;
  sendIncident?(
    input: OfflineIncidentSyncInput,
  ): Promise<OfflineIncidentSyncReceipt>;
  ensureForeground?(): void;
  now?: () => number;
}

export interface OfflineSyncRunResult {
  applied: number;
  conflicts: number;
  failed: number;
  deferred: number;
}

export class OfflineVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineVaultError";
  }
}

export class OfflineVaultIntegrityError extends OfflineVaultError {
  constructor() {
    super(
      "La bóveda no superó la verificación de integridad. Se bloqueó sin mostrar datos.",
    );
    this.name = "OfflineVaultIntegrityError";
  }
}

export class OfflineQueueAuthorizationError extends OfflineVaultError {
  constructor() {
    super(
      "La identidad vigente no coincide con la bóveda. Inicia sesión nuevamente antes de sincronizar.",
    );
    this.name = "OfflineQueueAuthorizationError";
  }
}

export class OfflineQueueForegroundRequiredError extends OfflineVaultError {
  constructor() {
    super(
      "La sincronización se detuvo al ocultar la aplicación. Desbloquea la bóveda y reintenta en primer plano.",
    );
    this.name = "OfflineQueueForegroundRequiredError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function assertBrowserPrimitives() {
  if (
    typeof indexedDB === "undefined" ||
    !globalThis.crypto?.subtle ||
    typeof TextEncoder === "undefined" ||
    typeof TextDecoder === "undefined"
  ) {
    throw new OfflineVaultError(
      "Este navegador no ofrece las primitivas seguras necesarias para la bóveda offline.",
    );
  }
}

export function supportsSecureOfflineVault(): boolean {
  return (
    typeof indexedDB !== "undefined" &&
    Boolean(globalThis.crypto?.subtle) &&
    typeof TextEncoder !== "undefined" &&
    typeof TextDecoder !== "undefined"
  );
}

function normalizeIdentity(
  identity: OfflineVaultIdentity,
): OfflineVaultIdentity {
  const tenantId = identity.tenantId.normalize("NFKC").trim();
  const userId = identity.userId.normalize("NFKC").trim();
  const validSegment = (value: string) =>
    value.length > 0 &&
    value.length <= 128 &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    });

  if (!validSegment(tenantId) || !validSegment(userId)) {
    throw new OfflineVaultError("La identidad de la bóveda no es válida.");
  }
  return { tenantId, userId };
}

function identitiesMatch(
  left: OfflineVaultIdentity,
  right: OfflineVaultIdentity,
): boolean {
  return left.tenantId === right.tenantId && left.userId === right.userId;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(index, index + chunkSize)),
    );
  }
  return btoa(chunks.join(""));
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new OfflineVaultIntegrityError();
  }
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new OfflineVaultIntegrityError();
  }
}

function createRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function createUuid(): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = createRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !ELECTION_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isIanaTimeZone(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/^[A-Za-z][A-Za-z0-9._+-]*(\/[A-Za-z][A-Za-z0-9._+-]*)+$/.test(value)
  ) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function dateKeyInTimeZone(value: string, timeZone: string): string | null {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || !isIanaTimeZone(timeZone)) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function isValidElectionWindow(
  electionDate: unknown,
  votingStartDate: unknown,
  votingEndDate: unknown,
): votingStartDate is string {
  if (
    !isCivilDate(electionDate) ||
    !isCivilDate(votingStartDate) ||
    !isCivilDate(votingEndDate) ||
    votingStartDate > electionDate ||
    electionDate > votingEndDate
  ) {
    return false;
  }
  const span =
    (Date.parse(`${votingEndDate}T00:00:00.000Z`) -
      Date.parse(`${votingStartDate}T00:00:00.000Z`)) /
      86_400_000 +
    1;
  return Number.isSafeInteger(span) && span >= 1 && span <= 14;
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function assertPartitionHash(value: string): string {
  if (!PARTITION_PATTERN.test(value)) {
    throw new OfflineVaultIntegrityError();
  }
  return value;
}

export async function deriveOfflineVaultPartition(
  identity: OfflineVaultIdentity,
): Promise<string> {
  const normalized = normalizeIdentity(identity);
  const material = new TextEncoder().encode(
    JSON.stringify([normalized.tenantId, normalized.userId]),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", material);
  return bytesToBase64(new Uint8Array(digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function importOfflineVaultPassphrase(
  rawPassphrase: string,
): Promise<CryptoKey> {
  const passphrase = rawPassphrase.normalize("NFKC");
  if (
    passphrase.length < 12 ||
    passphrase.length > 256 ||
    passphrase !== passphrase.trim()
  ) {
    throw new OfflineVaultError(
      "La frase operativa debe tener entre 12 y 256 caracteres y no empezar ni terminar en espacios.",
    );
  }

  const bytes = new TextEncoder().encode(passphrase);
  try {
    return await globalThis.crypto.subtle.importKey(
      "raw",
      bytes,
      "PBKDF2",
      false,
      ["deriveKey"],
    );
  } finally {
    bytes.fill(0);
  }
}

type AuthenticatedRecordMetadata = Omit<
  StoredVaultRecord,
  "ciphertext" | "iv" | "salt"
>;

function authenticatedMetadata(
  record: StoredVaultRecord,
): AuthenticatedRecordMetadata {
  return copyRecordMetadata(record);
}

function additionalAuthenticatedData(
  partitionHash: string,
  metadata: AuthenticatedRecordMetadata,
): Uint8Array {
  // partitionHash is SHA-256(JSON.stringify([tenantId, userId])). Keeping the
  // raw identity encrypted lets an unauthenticated offline launch select a
  // vault without leaking tenant or actor identifiers in IndexedDB metadata.
  return new TextEncoder().encode(
    JSON.stringify([
      "politica-sostenible.offline-vault",
      partitionHash,
      metadata.type,
      metadata.id,
      metadata.version,
      metadata.state,
      metadata.createdAt,
      metadata.updatedAt,
      metadata.capturedAt,
      metadata.lastAttemptAt,
      metadata.nextAttemptAt,
      metadata.attempts,
    ]),
  );
}

async function deriveRecordEncryptionKey(
  passwordKey: CryptoKey,
  salt: Uint8Array,
): Promise<CryptoKey> {
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: OFFLINE_VAULT_PBKDF2_ITERATIONS,
      salt: ownedArrayBuffer(salt),
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptOfflineVaultPayload(
  passwordKey: CryptoKey,
  partitionHash: string,
  metadata: AuthenticatedRecordMetadata,
  payload: unknown,
): Promise<Pick<StoredVaultRecord, "ciphertext" | "iv" | "salt">> {
  assertPartitionHash(partitionHash);
  const salt = createRandomBytes(16);
  const iv = createRandomBytes(12);
  const key = await deriveRecordEncryptionKey(passwordKey, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  try {
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: ownedArrayBuffer(iv),
        additionalData: ownedArrayBuffer(
          additionalAuthenticatedData(partitionHash, metadata),
        ),
        tagLength: 128,
      },
      key,
      ownedArrayBuffer(plaintext),
    );
    return {
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      iv: bytesToBase64(iv),
      salt: bytesToBase64(salt),
    };
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptOfflineVaultPayload(
  passwordKey: CryptoKey,
  partitionHash: string,
  record: StoredVaultRecord,
): Promise<unknown> {
  const validated = validateStoredRecord(record);
  const salt = base64ToBytes(validated.salt);
  const iv = base64ToBytes(validated.iv);
  const ciphertext = base64ToBytes(validated.ciphertext);
  if (
    salt.byteLength !== 16 ||
    iv.byteLength !== 12 ||
    ciphertext.length < 16
  ) {
    throw new OfflineVaultIntegrityError();
  }
  try {
    const key = await deriveRecordEncryptionKey(passwordKey, salt);
    const plaintextBuffer = await globalThis.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ownedArrayBuffer(iv),
        additionalData: ownedArrayBuffer(
          additionalAuthenticatedData(
            assertPartitionHash(partitionHash),
            authenticatedMetadata(validated),
          ),
        ),
        tagLength: 128,
      },
      key,
      ownedArrayBuffer(ciphertext),
    );
    const plaintext = new Uint8Array(plaintextBuffer);
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
      );
    } finally {
      plaintext.fill(0);
    }
  } catch (error) {
    if (error instanceof OfflineVaultIntegrityError) throw error;
    throw new OfflineVaultIntegrityError();
  } finally {
    salt.fill(0);
    iv.fill(0);
    ciphertext.fill(0);
  }
}

export function validateStoredRecord(value: unknown): StoredVaultRecord {
  if (!isRecord(value)) throw new OfflineVaultIntegrityError();
  const types = new Set<StoredVaultRecordType>([
    CONTEXT_TYPE,
    "VOTER_CAPTURE",
    "E14_REPORT",
    "INCIDENT_REPORT",
  ]);
  const states = new Set<OfflineQueueRecordState>([
    "PENDING",
    "SYNCING",
    "CONFLICT",
    "FAILED",
    "APPLIED",
  ]);

  if (
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.type !== "string" ||
    !types.has(value.type as StoredVaultRecordType) ||
    typeof value.state !== "string" ||
    !states.has(value.state as OfflineQueueRecordState) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    !isNullableTimestamp(value.capturedAt) ||
    !isNullableTimestamp(value.lastAttemptAt) ||
    !isNullableTimestamp(value.nextAttemptAt) ||
    !Number.isSafeInteger(value.attempts) ||
    (value.attempts as number) < 0 ||
    (value.attempts as number) > 1_000 ||
    typeof value.ciphertext !== "string" ||
    value.ciphertext.length < 24 ||
    typeof value.iv !== "string" ||
    typeof value.salt !== "string" ||
    value.version !== OFFLINE_VAULT_CRYPTO_VERSION
  ) {
    throw new OfflineVaultIntegrityError();
  }

  if (
    (value.type === CONTEXT_TYPE && value.capturedAt !== null) ||
    (value.type !== CONTEXT_TYPE && value.capturedAt === null)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  return value as unknown as StoredVaultRecord;
}

function storedRecordsEqual(
  left: StoredVaultRecord,
  right: StoredVaultRecord,
): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.state === right.state &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.capturedAt === right.capturedAt &&
    left.lastAttemptAt === right.lastAttemptAt &&
    left.nextAttemptAt === right.nextAttemptAt &&
    left.attempts === right.attempts &&
    left.ciphertext === right.ciphertext &&
    left.iv === right.iv &&
    left.salt === right.salt &&
    left.version === right.version
  );
}

export type VaultUpgradeStep = "CREATE_RECORD_STORE" | "CREATE_RECORD_INDEXES";

export function requiredVaultUpgradeSteps(
  oldVersion: number,
): VaultUpgradeStep[] {
  if (!Number.isInteger(oldVersion) || oldVersion < 0) {
    throw new OfflineVaultIntegrityError();
  }
  return [
    ...(oldVersion < 1 ? (["CREATE_RECORD_STORE"] as const) : []),
    ...(oldVersion < 2 ? (["CREATE_RECORD_INDEXES"] as const) : []),
  ];
}

export function upgradeOfflineVaultDatabase(
  database: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
): void {
  const steps = requiredVaultUpgradeSteps(oldVersion);
  let store: IDBObjectStore;
  if (steps.includes("CREATE_RECORD_STORE")) {
    store = database.createObjectStore(RECORD_STORE, { keyPath: "id" });
  } else {
    store = transaction.objectStore(RECORD_STORE);
  }
  if (steps.includes("CREATE_RECORD_INDEXES")) {
    if (!store.indexNames.contains("by_type")) {
      store.createIndex("by_type", "type", { unique: false });
    }
    if (!store.indexNames.contains("by_state")) {
      store.createIndex("by_state", "state", { unique: false });
    }
    if (!store.indexNames.contains("by_created_at")) {
      store.createIndex("by_created_at", "createdAt", { unique: false });
    }
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new OfflineVaultError("IndexedDB rechazó la operación."));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(new OfflineVaultError("La transacción cifrada fue cancelada."));
    transaction.onerror = () =>
      reject(
        new OfflineVaultError(
          "No fue posible completar la transacción cifrada.",
        ),
      );
  });
}

function openVaultDatabase(partitionHash: string): Promise<IDBDatabase> {
  assertBrowserPrimitives();
  const normalizedPartition = assertPartitionHash(partitionHash);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      `${VAULT_DATABASE_PREFIX}${normalizedPartition}`,
      OFFLINE_VAULT_DB_VERSION,
    );
    request.onupgradeneeded = (event) => {
      if (!request.transaction) {
        reject(
          new OfflineVaultError("IndexedDB no inició la migración esperada."),
        );
        return;
      }
      upgradeOfflineVaultDatabase(
        request.result,
        request.transaction,
        event.oldVersion,
      );
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      reject(new OfflineVaultError("No fue posible abrir la bóveda local."));
    request.onblocked = () =>
      reject(
        new OfflineVaultError(
          "Otra ventana mantiene una versión antigua de la bóveda abierta.",
        ),
      );
  });
}

export class IndexedDbVaultRecordStore implements VaultRecordStore {
  readonly partitionHash: string;

  constructor(partitionHash: string) {
    this.partitionHash = assertPartitionHash(partitionHash);
  }

  async list(): Promise<StoredVaultRecord[]> {
    const database = await openVaultDatabase(this.partitionHash);
    try {
      const transaction = database.transaction(RECORD_STORE, "readonly");
      const done = transactionCompletion(transaction);
      const values = await requestResult(
        transaction.objectStore(RECORD_STORE).getAll(),
      );
      await done;
      return values
        .map(validateStoredRecord)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    } finally {
      database.close();
    }
  }

  async get(id: string): Promise<StoredVaultRecord | null> {
    if (!UUID_PATTERN.test(id)) throw new OfflineVaultIntegrityError();
    const database = await openVaultDatabase(this.partitionHash);
    try {
      const transaction = database.transaction(RECORD_STORE, "readonly");
      const done = transactionCompletion(transaction);
      const value = await requestResult(
        transaction.objectStore(RECORD_STORE).get(id),
      );
      await done;
      return value === undefined ? null : validateStoredRecord(value);
    } finally {
      database.close();
    }
  }

  async put(record: StoredVaultRecord): Promise<void> {
    const validated = validateStoredRecord(record);
    const database = await openVaultDatabase(this.partitionHash);
    try {
      const transaction = database.transaction(RECORD_STORE, "readwrite");
      const done = transactionCompletion(transaction);
      transaction.objectStore(RECORD_STORE).put(validated);
      await done;
    } finally {
      database.close();
    }
  }

  async deleteIfUnchanged(expectedValue: StoredVaultRecord): Promise<boolean> {
    const expected = validateStoredRecord(expectedValue);
    const database = await openVaultDatabase(this.partitionHash);
    try {
      const transaction = database.transaction(RECORD_STORE, "readwrite");
      const done = transactionCompletion(transaction);
      const store = transaction.objectStore(RECORD_STORE);
      const value = await requestResult(store.get(expected.id));
      if (value === undefined) {
        await done;
        return false;
      }
      if (!storedRecordsEqual(validateStoredRecord(value), expected)) {
        await done;
        return false;
      }
      store.delete(expected.id);
      await done;
      return true;
    } finally {
      database.close();
    }
  }

  async replaceIfUnchanged(
    expectedValue: StoredVaultRecord,
    replacementValue: StoredVaultRecord,
  ): Promise<boolean> {
    const expected = validateStoredRecord(expectedValue);
    const replacement = validateStoredRecord(replacementValue);
    if (expected.id !== replacement.id) {
      throw new OfflineVaultIntegrityError();
    }
    const database = await openVaultDatabase(this.partitionHash);
    try {
      const transaction = database.transaction(RECORD_STORE, "readwrite");
      const done = transactionCompletion(transaction);
      const store = transaction.objectStore(RECORD_STORE);
      const value = await requestResult(store.get(expected.id));
      if (value === undefined) {
        await done;
        return false;
      }
      const current = validateStoredRecord(value);
      if (!storedRecordsEqual(current, expected)) {
        await done;
        return false;
      }
      store.put(replacement);
      await done;
      return true;
    } finally {
      database.close();
    }
  }
}

function openCatalogDatabase(): Promise<IDBDatabase> {
  assertBrowserPrimitives();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      VAULT_CATALOG_DATABASE,
      VAULT_CATALOG_VERSION,
    );
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CATALOG_STORE)) {
        request.result.createObjectStore(CATALOG_STORE, {
          keyPath: "partitionHash",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new OfflineVaultError("No fue posible abrir el catálogo de bóvedas."),
      );
  });
}

export async function registerKnownOfflineVault(
  partitionHash: string,
  now = new Date(),
): Promise<void> {
  const normalized = assertPartitionHash(partitionHash);
  const database = await openCatalogDatabase();
  try {
    const transaction = database.transaction(CATALOG_STORE, "readwrite");
    const done = transactionCompletion(transaction);
    transaction.objectStore(CATALOG_STORE).put({
      partitionHash: normalized,
      updatedAt: now.toISOString(),
    });
    await done;
  } finally {
    database.close();
  }
}

export async function listKnownOfflineVaults(): Promise<string[]> {
  const database = await openCatalogDatabase();
  try {
    const transaction = database.transaction(CATALOG_STORE, "readonly");
    const done = transactionCompletion(transaction);
    const values = await requestResult(
      transaction.objectStore(CATALOG_STORE).getAll(),
    );
    await done;
    return values
      .map((value) => {
        if (
          !isRecord(value) ||
          typeof value.partitionHash !== "string" ||
          !PARTITION_PATTERN.test(value.partitionHash) ||
          !isTimestamp(value.updatedAt)
        ) {
          throw new OfflineVaultIntegrityError();
        }
        return value.partitionHash;
      })
      .sort();
  } finally {
    database.close();
  }
}

function newRecordMetadata(
  type: StoredVaultRecordType,
  capturedAt: string | null,
  now: Date,
): Omit<StoredVaultRecord, "ciphertext" | "iv" | "salt"> {
  const timestamp = now.toISOString();
  return {
    id: createUuid(),
    type,
    state: type === CONTEXT_TYPE ? "APPLIED" : "PENDING",
    createdAt: timestamp,
    updatedAt: timestamp,
    capturedAt,
    lastAttemptAt: null,
    nextAttemptAt: null,
    attempts: 0,
    version: OFFLINE_VAULT_CRYPTO_VERSION,
  };
}

function copyRecordMetadata(
  record: StoredVaultRecord,
): Omit<StoredVaultRecord, "ciphertext" | "iv" | "salt"> {
  return {
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
}

async function sealRecord(
  session: Pick<OfflineVaultSession, "partitionHash" | "passwordKey">,
  metadata: Omit<StoredVaultRecord, "ciphertext" | "iv" | "salt">,
  payload: unknown,
): Promise<StoredVaultRecord> {
  const encrypted = await encryptOfflineVaultPayload(
    session.passwordKey,
    session.partitionHash,
    metadata,
    payload,
  );
  return validateStoredRecord({ ...metadata, ...encrypted });
}

function validateConsentNotice(
  value: unknown,
): NonNullable<VoterCaptureContext["consentNotice"]> {
  if (!isRecord(value)) throw new OfflineVaultIntegrityError();
  const requiredStrings = [
    "id",
    "version",
    "title",
    "content",
    "controllerName",
    "contactEmail",
    "activatedAt",
  ] as const;
  if (
    requiredStrings.some(
      (field) =>
        typeof value[field] !== "string" ||
        (value[field] as string).length === 0 ||
        (value[field] as string).length > 20_000,
    ) ||
    value.mode !== "CAMPAIGN" ||
    value.purpose !== "POLITICAL_COMMUNICATION" ||
    !isTimestamp(value.activatedAt) ||
    !(
      value.privacyPolicyUrl === null ||
      (typeof value.privacyPolicyUrl === "string" &&
        value.privacyPolicyUrl.length <= 2_048)
    )
  ) {
    throw new OfflineVaultIntegrityError();
  }
  return {
    id: value.id as string,
    mode: "CAMPAIGN",
    purpose: "POLITICAL_COMMUNICATION",
    version: value.version as string,
    title: value.title as string,
    content: value.content as string,
    controllerName: value.controllerName as string,
    contactEmail: value.contactEmail as string,
    privacyPolicyUrl: value.privacyPolicyUrl as string | null,
    activatedAt: value.activatedAt as string,
  };
}

export function validateOfflineCaptureContext(
  value: unknown,
): VoterCaptureContext {
  if (!isRecord(value) || !Array.isArray(value.puestos)) {
    throw new OfflineVaultIntegrityError();
  }
  if (value.puestos.length > 1_000) throw new OfflineVaultIntegrityError();
  const ids = new Set<string>();
  const puestos: VoterCaptureContext["puestos"] = [];
  for (const puesto of value.puestos) {
    if (
      !isRecord(puesto) ||
      typeof puesto.id !== "string" ||
      puesto.id.length === 0 ||
      puesto.id.length > 128 ||
      typeof puesto.code !== "string" ||
      puesto.code.length === 0 ||
      puesto.code.length > 128 ||
      typeof puesto.name !== "string" ||
      puesto.name.length === 0 ||
      puesto.name.length > 256 ||
      ids.has(puesto.id)
    ) {
      throw new OfflineVaultIntegrityError();
    }
    ids.add(puesto.id);
    puestos.push({
      id: puesto.id,
      code: puesto.code,
      name: puesto.name,
    });
  }
  const consentNotice =
    value.consentNotice === null
      ? null
      : validateConsentNotice(value.consentNotice);

  const normalized = { puestos, consentNotice } satisfies VoterCaptureContext;
  const serialized = JSON.stringify(normalized);
  if (
    new TextEncoder().encode(serialized).byteLength > MAX_CAPTURE_CONTEXT_BYTES
  ) {
    throw new OfflineVaultIntegrityError();
  }
  return JSON.parse(serialized) as VoterCaptureContext;
}

function encodedJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function validateHeatmapSnapshotForStorage(
  value: unknown,
): TerritoryHeatmapSnapshot {
  let snapshot: TerritoryHeatmapSnapshot;
  try {
    snapshot = validateTerritoryHeatmapSnapshot(value);
  } catch {
    throw new OfflineVaultError(
      "La vista territorial no cumple el contrato seguro para uso offline.",
    );
  }
  if (encodedJsonBytes(snapshot) > OFFLINE_HEATMAP_MAX_SNAPSHOT_BYTES) {
    throw new OfflineVaultError(
      "La vista territorial supera el tamaño máximo permitido para este dispositivo.",
    );
  }
  return snapshot;
}

export function pruneOfflineHeatmapSnapshots(
  values: readonly TerritoryHeatmapSnapshot[],
): TerritoryHeatmapSnapshot[] {
  const entries = values.map((value) => {
    const snapshot = validateHeatmapSnapshotForStorage(value);
    return {
      key: territoryHeatmapSnapshotKey(snapshot.query),
      size: encodedJsonBytes(snapshot),
      snapshot,
    };
  });
  if (new Set(entries.map((entry) => entry.key)).size !== entries.length) {
    throw new OfflineVaultError(
      "La bóveda recibió dos snapshots para la misma vista territorial.",
    );
  }

  entries.sort(
    (left, right) =>
      left.snapshot.savedAt.localeCompare(right.snapshot.savedAt) ||
      left.key.localeCompare(right.key),
  );
  let totalBytes = entries.reduce((total, entry) => total + entry.size, 0);
  while (
    entries.length > OFFLINE_HEATMAP_MAX_SNAPSHOTS ||
    totalBytes > OFFLINE_HEATMAP_MAX_TOTAL_BYTES
  ) {
    const removed = entries.shift();
    if (!removed) break;
    totalBytes -= removed.size;
  }

  return entries
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ snapshot }) => structuredClone(snapshot));
}

function validateStoredHeatmapSnapshots(
  value: unknown,
): TerritoryHeatmapSnapshot[] {
  if (!Array.isArray(value) || value.length > OFFLINE_HEATMAP_MAX_SNAPSHOTS) {
    throw new OfflineVaultIntegrityError();
  }
  try {
    const validated = value.map((snapshot) =>
      validateHeatmapSnapshotForStorage(snapshot),
    );
    const keys = validated.map((snapshot) =>
      territoryHeatmapSnapshotKey(snapshot.query),
    );
    if (
      new Set(keys).size !== keys.length ||
      validated.reduce(
        (total, snapshot) => total + encodedJsonBytes(snapshot),
        0,
      ) > OFFLINE_HEATMAP_MAX_TOTAL_BYTES
    ) {
      throw new OfflineVaultIntegrityError();
    }
    return validated;
  } catch {
    throw new OfflineVaultIntegrityError();
  }
}

export function validateOfflineE14Grant(
  value: unknown,
): OfflineE14CaptureGrant {
  const legacyKeys = [
    "schemaVersion",
    "captureGrant",
    "captureContext",
    "issuedAt",
    "expiresAt",
    "electionDate",
    "places",
  ];
  const currentKeys = [
    ...legacyKeys,
    "votingStartDate",
    "votingEndDate",
    "electionWindowSha256",
  ];
  const legacy =
    isRecord(value) &&
    value.schemaVersion === 1 &&
    hasExactKeys(value, legacyKeys);
  const versionTwo =
    isRecord(value) &&
    value.schemaVersion === 2 &&
    hasExactKeys(value, currentKeys);
  const current =
    isRecord(value) &&
    value.schemaVersion === 3 &&
    hasExactKeys(value, currentKeys);
  if (
    !isRecord(value) ||
    (!legacy && !versionTwo && !current) ||
    typeof value.captureGrant !== "string" ||
    !E14_GRANT_PATTERN.test(value.captureGrant) ||
    !["SIMULATION", "REAL"].includes(String(value.captureContext)) ||
    !isTimestamp(value.issuedAt) ||
    !isTimestamp(value.expiresAt) ||
    !isCivilDate(value.electionDate) ||
    !Array.isArray(value.places) ||
    value.places.length === 0 ||
    value.places.length > 5_000
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const issuedAt = Date.parse(value.issuedAt);
  const expiresAt = Date.parse(value.expiresAt);
  const votingStartDate = legacy ? value.electionDate : value.votingStartDate;
  const votingEndDate = legacy ? value.electionDate : value.votingEndDate;
  const electionWindowSha256 = legacy
    ? LEGACY_ELECTION_WINDOW_SHA256
    : value.electionWindowSha256;
  if (
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > 48 * 60 * 60 * 1_000 + 1_000 ||
    !isValidElectionWindow(
      value.electionDate,
      votingStartDate,
      votingEndDate,
    ) ||
    typeof electionWindowSha256 !== "string" ||
    !SHA256_PATTERN.test(electionWindowSha256)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const normalizedVotingStartDate = votingStartDate as string;
  const normalizedVotingEndDate = votingEndDate as string;
  const normalizedElectionWindowSha256 = electionWindowSha256 as string;
  const ids = new Set<string>();
  const places: OfflineE14CaptureGrant["places"] = [];
  for (const place of value.places) {
    const legacyPlaceKeys = ["id", "code", "name", "expectedTables"];
    const currentPlaceKeys = [
      ...legacyPlaceKeys,
      "sourceLocationCode",
      "votingDate",
      "timeZone",
      "address",
      "commune",
    ];
    if (
      !isRecord(place) ||
      !hasExactKeys(place, current ? currentPlaceKeys : legacyPlaceKeys) ||
      typeof place.id !== "string" ||
      place.id.length === 0 ||
      place.id.length > 128 ||
      ids.has(place.id) ||
      typeof place.code !== "string" ||
      place.code.length === 0 ||
      place.code.length > 128 ||
      typeof place.name !== "string" ||
      place.name.length === 0 ||
      place.name.length > 256 ||
      !Number.isSafeInteger(place.expectedTables) ||
      (place.expectedTables as number) < 1 ||
      (place.expectedTables as number) > 99_999
    ) {
      throw new OfflineVaultIntegrityError();
    }
    const sourceLocationCode = current ? place.sourceLocationCode : null;
    const votingDate = current ? place.votingDate : null;
    const timeZone = current ? place.timeZone : null;
    const address = current ? place.address : null;
    const commune = current ? place.commune : null;
    if (
      !(
        sourceLocationCode === null ||
        (typeof sourceLocationCode === "string" &&
          /^[0-9]{1,32}$/.test(sourceLocationCode))
      ) ||
      !(votingDate === null || isCivilDate(votingDate)) ||
      !(timeZone === null || isIanaTimeZone(timeZone)) ||
      !(
        address === null ||
        (typeof address === "string" &&
          address.trim() === address &&
          address.length > 0 &&
          address.length <= 500)
      ) ||
      !(
        commune === null ||
        (typeof commune === "string" &&
          commune.trim() === commune &&
          commune.length > 0 &&
          commune.length <= 240)
      ) ||
      (current &&
        value.captureContext === "REAL" &&
        (!isCivilDate(votingDate) || !isIanaTimeZone(timeZone)))
    ) {
      throw new OfflineVaultIntegrityError();
    }
    ids.add(place.id);
    places.push({
      id: place.id,
      code: place.code,
      name: place.name,
      expectedTables: place.expectedTables as number,
      sourceLocationCode: sourceLocationCode as string | null,
      votingDate: votingDate as string | null,
      timeZone: timeZone as string | null,
      address: address as string | null,
      commune: commune as string | null,
    });
  }
  const normalized: OfflineE14CaptureGrant = {
    schemaVersion: 3,
    captureGrant: value.captureGrant,
    captureContext: value.captureContext as ActiveWitnessCaptureContext,
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    electionDate: value.electionDate,
    votingStartDate: normalizedVotingStartDate,
    votingEndDate: normalizedVotingEndDate,
    electionWindowSha256: normalizedElectionWindowSha256,
    places,
  };
  if (encodedJsonBytes(normalized) > MAX_E14_GRANT_BYTES) {
    throw new OfflineVaultIntegrityError();
  }
  return structuredClone(normalized);
}

export function validateOfflineIncidentContext(
  value: unknown,
): OfflineIncidentCaptureContext {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "provisionedAt",
      "stage",
      "requiresTerritory",
      "categories",
      "priorities",
      "territories",
    ]) ||
    value.schemaVersion !== 1 ||
    !isTimestamp(value.provisionedAt) ||
    typeof value.stage !== "string" ||
    value.stage.length === 0 ||
    value.stage.length > 64 ||
    typeof value.requiresTerritory !== "boolean" ||
    !Array.isArray(value.categories) ||
    !Array.isArray(value.priorities) ||
    !Array.isArray(value.territories) ||
    value.territories.length > 2_000
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const categorySet = new Set<string>(OFFLINE_INCIDENT_CATEGORIES);
  const prioritySet = new Set<string>(OFFLINE_INCIDENT_PRIORITIES);
  if (
    value.categories.length === 0 ||
    value.priorities.length === 0 ||
    new Set(value.categories).size !== value.categories.length ||
    new Set(value.priorities).size !== value.priorities.length ||
    value.categories.some(
      (item) => typeof item !== "string" || !categorySet.has(item),
    ) ||
    value.priorities.some(
      (item) => typeof item !== "string" || !prioritySet.has(item),
    )
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const ids = new Set<string>();
  const territories = value.territories.map((territory) => {
    if (
      !isRecord(territory) ||
      !hasExactKeys(territory, ["id", "code", "name", "type"]) ||
      typeof territory.id !== "string" ||
      territory.id.length === 0 ||
      territory.id.length > 128 ||
      ids.has(territory.id) ||
      typeof territory.code !== "string" ||
      territory.code.length === 0 ||
      territory.code.length > 128 ||
      typeof territory.name !== "string" ||
      territory.name.length === 0 ||
      territory.name.length > 256 ||
      typeof territory.type !== "string" ||
      territory.type.length === 0 ||
      territory.type.length > 64
    ) {
      throw new OfflineVaultIntegrityError();
    }
    ids.add(territory.id);
    return {
      id: territory.id,
      code: territory.code,
      name: territory.name,
      type: territory.type,
    };
  });
  if (value.requiresTerritory && territories.length === 0) {
    throw new OfflineVaultIntegrityError();
  }
  const normalized: OfflineIncidentCaptureContext = {
    schemaVersion: 1,
    provisionedAt: new Date(value.provisionedAt).toISOString(),
    stage: value.stage,
    requiresTerritory: value.requiresTerritory,
    categories: [
      ...value.categories,
    ] as OfflineIncidentCaptureContext["categories"],
    priorities: [
      ...value.priorities,
    ] as OfflineIncidentCaptureContext["priorities"],
    territories,
  };
  if (encodedJsonBytes(normalized) > MAX_INCIDENT_CONTEXT_BYTES) {
    throw new OfflineVaultIntegrityError();
  }
  return structuredClone(normalized);
}

export function validateOfflineCalendarSnapshot(
  value: unknown,
): OfflineElectoralCalendarSnapshot {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "readOnly",
      "releaseId",
      "versionLabel",
      "roundCode",
      "sourceSha256",
      "sourceCutoffAt",
      "timeZone",
      "savedAt",
      "milestones",
    ]) ||
    value.schemaVersion !== 1 ||
    value.readOnly !== true ||
    typeof value.releaseId !== "string" ||
    value.releaseId.length === 0 ||
    value.releaseId.length > 128 ||
    typeof value.versionLabel !== "string" ||
    value.versionLabel.length === 0 ||
    value.versionLabel.length > 120 ||
    typeof value.roundCode !== "string" ||
    value.roundCode.length === 0 ||
    value.roundCode.length > 64 ||
    typeof value.sourceSha256 !== "string" ||
    !SHA256_PATTERN.test(value.sourceSha256) ||
    !isTimestamp(value.sourceCutoffAt) ||
    !isIanaTimeZone(value.timeZone) ||
    !isTimestamp(value.savedAt) ||
    !Array.isArray(value.milestones) ||
    value.milestones.length === 0 ||
    value.milestones.length > 1_000
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const ids = new Set<string>();
  const stableKeys = new Set<string>();
  const milestones = value.milestones.map((milestone) => {
    if (
      !isRecord(milestone) ||
      !hasExactKeys(milestone, [
        "id",
        "stableKey",
        "title",
        "category",
        "semantics",
        "localDate",
        "localTime",
        "timeZone",
        "responsibleName",
        "backupName",
      ]) ||
      typeof milestone.id !== "string" ||
      milestone.id.length === 0 ||
      milestone.id.length > 128 ||
      ids.has(milestone.id) ||
      typeof milestone.stableKey !== "string" ||
      milestone.stableKey.length === 0 ||
      milestone.stableKey.length > 128 ||
      stableKeys.has(milestone.stableKey) ||
      typeof milestone.title !== "string" ||
      milestone.title.length === 0 ||
      milestone.title.length > 300 ||
      typeof milestone.category !== "string" ||
      milestone.category.length === 0 ||
      milestone.category.length > 64 ||
      typeof milestone.semantics !== "string" ||
      milestone.semantics.length === 0 ||
      milestone.semantics.length > 64 ||
      !isCivilDate(milestone.localDate) ||
      !(
        milestone.localTime === null ||
        (typeof milestone.localTime === "string" &&
          /^\d{2}:\d{2}$/.test(milestone.localTime))
      ) ||
      !isIanaTimeZone(milestone.timeZone) ||
      !(
        milestone.responsibleName === null ||
        (typeof milestone.responsibleName === "string" &&
          milestone.responsibleName.length > 0 &&
          milestone.responsibleName.length <= 200)
      ) ||
      !(
        milestone.backupName === null ||
        (typeof milestone.backupName === "string" &&
          milestone.backupName.length > 0 &&
          milestone.backupName.length <= 200)
      )
    ) {
      throw new OfflineVaultIntegrityError();
    }
    ids.add(milestone.id);
    stableKeys.add(milestone.stableKey);
    return milestone as unknown as OfflineCalendarSnapshotMilestone;
  });
  const normalized: OfflineElectoralCalendarSnapshot = {
    schemaVersion: 1,
    readOnly: true,
    releaseId: value.releaseId,
    versionLabel: value.versionLabel,
    roundCode: value.roundCode,
    sourceSha256: value.sourceSha256,
    sourceCutoffAt: new Date(value.sourceCutoffAt).toISOString(),
    timeZone: value.timeZone,
    savedAt: new Date(value.savedAt).toISOString(),
    milestones: milestones.map((milestone) => ({ ...milestone })),
  };
  if (encodedJsonBytes(normalized) > MAX_CALENDAR_SNAPSHOT_BYTES) {
    throw new OfflineVaultIntegrityError();
  }
  return structuredClone(normalized);
}

function validateContextPayload(value: unknown): VaultContextPayload {
  const isLegacy = isRecord(value) && value.schemaVersion === 1;
  const isVersionTwo = isRecord(value) && value.schemaVersion === 2;
  const isVersionThree = isRecord(value) && value.schemaVersion === 3;
  const expectedKeys = isLegacy
    ? ["kind", "schemaVersion", "identity", "captureContext", "provisionedAt"]
    : isVersionTwo
      ? [
          "kind",
          "schemaVersion",
          "identity",
          "captureContext",
          "provisionedAt",
          "heatmapSnapshots",
        ]
      : isVersionThree
        ? [
            "kind",
            "schemaVersion",
            "identity",
            "captureContext",
            "provisionedAt",
            "heatmapSnapshots",
            "e14Grant",
          ]
        : [
            "kind",
            "schemaVersion",
            "identity",
            "captureContext",
            "provisionedAt",
            "heatmapSnapshots",
            "e14Grant",
            "incidentContext",
            "electoralCalendarSnapshot",
          ];
  if (
    !isRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    value.kind !== CONTEXT_TYPE ||
    ![1, 2, 3, 4].includes(Number(value.schemaVersion)) ||
    !isRecord(value.identity) ||
    !hasExactKeys(value.identity, ["tenantId", "userId"]) ||
    typeof value.identity.tenantId !== "string" ||
    typeof value.identity.userId !== "string" ||
    !isNullableTimestamp(value.provisionedAt) ||
    !(value.captureContext === null || isRecord(value.captureContext)) ||
    (!isLegacy && !Array.isArray(value.heatmapSnapshots)) ||
    (!isLegacy &&
      !isVersionTwo &&
      !(value.e14Grant === null || isRecord(value.e14Grant))) ||
    (!isLegacy &&
      !isVersionTwo &&
      !isVersionThree &&
      !(value.incidentContext === null || isRecord(value.incidentContext))) ||
    (!isLegacy &&
      !isVersionTwo &&
      !isVersionThree &&
      !(
        value.electoralCalendarSnapshot === null ||
        isRecord(value.electoralCalendarSnapshot)
      ))
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const identity = normalizeIdentity({
    tenantId: value.identity.tenantId,
    userId: value.identity.userId,
  });
  const captureContext =
    value.captureContext === null
      ? null
      : validateOfflineCaptureContext(value.captureContext);
  const normalized = {
    kind: CONTEXT_TYPE,
    schemaVersion: 4,
    identity,
    captureContext,
    provisionedAt: value.provisionedAt,
    heatmapSnapshots: isLegacy
      ? []
      : validateStoredHeatmapSnapshots(value.heatmapSnapshots),
    e14Grant:
      isLegacy || isVersionTwo || value.e14Grant === null
        ? null
        : validateOfflineE14Grant(value.e14Grant),
    incidentContext:
      isLegacy ||
      isVersionTwo ||
      isVersionThree ||
      value.incidentContext === null
        ? null
        : validateOfflineIncidentContext(value.incidentContext),
    electoralCalendarSnapshot:
      isLegacy ||
      isVersionTwo ||
      isVersionThree ||
      value.electoralCalendarSnapshot === null
        ? null
        : validateOfflineCalendarSnapshot(value.electoralCalendarSnapshot),
  } satisfies VaultContextPayload;
  if (encodedJsonBytes(normalized) > MAX_VAULT_CONTEXT_BYTES) {
    throw new OfflineVaultIntegrityError();
  }
  return normalized;
}

async function getContextRecord(
  store: VaultRecordStore,
): Promise<StoredVaultRecord | null> {
  const records = (await store.list()).filter(
    (record) => record.type === CONTEXT_TYPE,
  );
  if (records.length > 1) throw new OfflineVaultIntegrityError();
  return records[0] ?? null;
}

async function readContextPayload(
  session: OfflineVaultSession,
): Promise<{ record: StoredVaultRecord; payload: VaultContextPayload }> {
  const record = await getContextRecord(session.store);
  if (!record) throw new OfflineVaultIntegrityError();
  const decrypted = await decryptOfflineVaultPayload(
    session.passwordKey,
    session.partitionHash,
    record,
  );
  const payload = validateContextPayload(decrypted);
  const derivedPartition = await deriveOfflineVaultPartition(payload.identity);
  if (
    derivedPartition !== session.partitionHash ||
    !identitiesMatch(payload.identity, session.identity)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  return { record, payload };
}

export async function vaultHasContext(
  store: VaultRecordStore,
): Promise<boolean> {
  return (await getContextRecord(store)) !== null;
}

export async function createOfflineVaultSession(
  store: VaultRecordStore,
  identityInput: OfflineVaultIdentity,
  passphrase: string,
  now = new Date(),
): Promise<OfflineVaultSession> {
  const identity = normalizeIdentity(identityInput);
  const partitionHash = await deriveOfflineVaultPartition(identity);
  if (partitionHash !== store.partitionHash) {
    throw new OfflineVaultIntegrityError();
  }
  if ((await store.list()).length !== 0) {
    throw new OfflineVaultError(
      "La partición ya contiene una bóveda. Desbloquéala en lugar de reemplazarla.",
    );
  }
  const passwordKey = await importOfflineVaultPassphrase(passphrase);
  const session: OfflineVaultSession = {
    partitionHash,
    identity,
    passwordKey,
    store,
  };
  const metadata = newRecordMetadata(CONTEXT_TYPE, null, now);
  const payload: VaultContextPayload = {
    kind: CONTEXT_TYPE,
    schemaVersion: 4,
    identity,
    captureContext: null,
    provisionedAt: null,
    heatmapSnapshots: [],
    e14Grant: null,
    incidentContext: null,
    electoralCalendarSnapshot: null,
  };
  await store.put(await sealRecord(session, metadata, payload));
  return session;
}

export async function unlockOfflineVaultSession(
  store: VaultRecordStore,
  passphrase: string,
  expectedIdentity?: OfflineVaultIdentity,
): Promise<OfflineVaultSession> {
  const record = await getContextRecord(store);
  if (!record) {
    throw new OfflineVaultError(
      "No existe una bóveda provisionada en esta partición.",
    );
  }
  const passwordKey = await importOfflineVaultPassphrase(passphrase);
  const decrypted = await decryptOfflineVaultPayload(
    passwordKey,
    store.partitionHash,
    record,
  );
  if (!isRecord(decrypted) || !isRecord(decrypted.identity)) {
    throw new OfflineVaultIntegrityError();
  }
  let identity: OfflineVaultIdentity;
  try {
    identity = normalizeIdentity({
      tenantId: String(decrypted.identity.tenantId ?? ""),
      userId: String(decrypted.identity.userId ?? ""),
    });
  } catch {
    throw new OfflineVaultIntegrityError();
  }
  const session: OfflineVaultSession = {
    partitionHash: store.partitionHash,
    identity,
    passwordKey,
    store,
  };
  await readContextPayload(session);
  if (
    expectedIdentity &&
    !identitiesMatch(identity, normalizeIdentity(expectedIdentity))
  ) {
    throw new OfflineQueueAuthorizationError();
  }
  await recoverStaleSyncingRecords(session, new Date());
  await purgeAppliedQueueRecords(session);
  return session;
}

export async function provisionOfflineCaptureContext(
  session: OfflineVaultSession,
  contextInput: VoterCaptureContext,
  now = new Date(),
): Promise<void> {
  const context = validateOfflineCaptureContext(contextInput);
  const { record, payload } = await readContextPayload(session);
  const nextPayload: VaultContextPayload = {
    ...payload,
    schemaVersion: 4,
    captureContext: context,
    provisionedAt: now.toISOString(),
  };
  const metadata = {
    ...record,
    updatedAt: now.toISOString(),
  };
  const recordMetadata = copyRecordMetadata(metadata);
  const replacement = await sealRecord(session, recordMetadata, nextPayload);
  if (!(await session.store.replaceIfUnchanged(record, replacement))) {
    throw new OfflineVaultError(
      "El contexto cambió en otra ventana. Vuelve a provisionarlo.",
    );
  }
}

export async function readOfflineCaptureContext(
  session: OfflineVaultSession,
): Promise<VoterCaptureContext | null> {
  const { payload } = await readContextPayload(session);
  return payload.captureContext
    ? validateOfflineCaptureContext(payload.captureContext)
    : null;
}

export async function provisionOfflineE14Grant(
  session: OfflineVaultSession,
  grantInput: OfflineE14CaptureGrant,
  now = new Date(),
): Promise<void> {
  const grant = validateOfflineE14Grant(grantInput);
  if (!Number.isFinite(now.getTime())) {
    throw new OfflineVaultError("La fecha de provisionamiento no es valida.");
  }
  const { record, payload } = await readContextPayload(session);
  const nextPayload: VaultContextPayload = {
    ...payload,
    schemaVersion: 4,
    e14Grant: grant,
  };
  const replacement = await sealRecord(
    session,
    copyRecordMetadata({ ...record, updatedAt: now.toISOString() }),
    nextPayload,
  );
  if (!(await session.store.replaceIfUnchanged(record, replacement))) {
    throw new OfflineVaultError(
      "La boveda cambio en otra ventana. Vuelve a provisionar E-14.",
    );
  }
}

export async function readOfflineE14Grant(
  session: OfflineVaultSession,
): Promise<OfflineE14CaptureGrant | null> {
  const { payload } = await readContextPayload(session);
  return payload.e14Grant ? validateOfflineE14Grant(payload.e14Grant) : null;
}

export async function clearOfflineE14Grant(
  session: OfflineVaultSession,
  now = new Date(),
): Promise<void> {
  const { record, payload } = await readContextPayload(session);
  const replacement = await sealRecord(
    session,
    copyRecordMetadata({ ...record, updatedAt: now.toISOString() }),
    { ...payload, schemaVersion: 4, e14Grant: null },
  );
  if (!(await session.store.replaceIfUnchanged(record, replacement))) {
    throw new OfflineVaultError(
      "La boveda cambio en otra ventana. Vuelve a retirar la capacidad E-14.",
    );
  }
}

export async function provisionOfflineIncidentContext(
  session: OfflineVaultSession,
  contextInput: OfflineIncidentCaptureContext,
  now = new Date(),
): Promise<void> {
  if (!Number.isFinite(now.getTime())) {
    throw new OfflineVaultError("La fecha de provisionamiento no es valida.");
  }
  const context = validateOfflineIncidentContext(contextInput);
  const { record, payload } = await readContextPayload(session);
  const nextPayload: VaultContextPayload = {
    ...payload,
    schemaVersion: 4,
    incidentContext: context,
  };
  const replacement = await sealRecord(
    session,
    copyRecordMetadata({ ...record, updatedAt: now.toISOString() }),
    nextPayload,
  );
  if (!(await session.store.replaceIfUnchanged(record, replacement))) {
    throw new OfflineVaultError(
      "La boveda cambio en otra ventana. Vuelve a provisionar incidentes.",
    );
  }
}

export async function readOfflineIncidentContext(
  session: OfflineVaultSession,
): Promise<OfflineIncidentCaptureContext | null> {
  const { payload } = await readContextPayload(session);
  return payload.incidentContext
    ? validateOfflineIncidentContext(payload.incidentContext)
    : null;
}

export async function saveOfflineCalendarSnapshot(
  session: OfflineVaultSession,
  snapshotInput: OfflineElectoralCalendarSnapshot,
  now = new Date(),
): Promise<OfflineElectoralCalendarSnapshot> {
  if (!Number.isFinite(now.getTime())) {
    throw new OfflineVaultError("La fecha de guardado offline no es valida.");
  }
  const snapshot = validateOfflineCalendarSnapshot(snapshotInput);
  if (Date.parse(snapshot.savedAt) > now.getTime() + CAPTURE_CLOCK_SKEW_MS) {
    throw new OfflineVaultError(
      "El corte de la copia del calendario no es valido.",
    );
  }
  const { record, payload } = await readContextPayload(session);
  const nextPayload: VaultContextPayload = {
    ...payload,
    schemaVersion: 4,
    electoralCalendarSnapshot: snapshot,
  };
  const replacement = await sealRecord(
    session,
    copyRecordMetadata({ ...record, updatedAt: now.toISOString() }),
    nextPayload,
  );
  if (!(await session.store.replaceIfUnchanged(record, replacement))) {
    throw new OfflineVaultError(
      "La boveda cambio en otra ventana. Vuelve a guardar el calendario.",
    );
  }
  return structuredClone(snapshot);
}

export async function readOfflineCalendarSnapshot(
  session: OfflineVaultSession,
): Promise<OfflineElectoralCalendarSnapshot | null> {
  const { payload } = await readContextPayload(session);
  return payload.electoralCalendarSnapshot
    ? validateOfflineCalendarSnapshot(payload.electoralCalendarSnapshot)
    : null;
}

export async function saveOfflineHeatmapSnapshot(
  session: OfflineVaultSession,
  queryInput: TerritoryHeatmapQuery,
  responseInput: TerritoryHeatmapResponse,
  now = new Date(),
): Promise<TerritoryHeatmapSnapshot> {
  let query: TerritoryHeatmapQuery;
  let response: TerritoryHeatmapResponse;
  try {
    query = validateTerritoryHeatmapQuery(queryInput);
    response = validateTerritoryHeatmapResponse(responseInput, query);
  } catch {
    throw new OfflineVaultError(
      "La vista territorial no cumple el contrato seguro para uso offline.",
    );
  }
  if (!Number.isFinite(now.getTime())) {
    throw new OfflineVaultError("La fecha de guardado offline no es válida.");
  }

  const snapshot = validateHeatmapSnapshotForStorage({
    schemaVersion: 1,
    query,
    savedAt: now.toISOString(),
    response,
  });
  const { record, payload } = await readContextPayload(session);
  const snapshotKey = territoryHeatmapSnapshotKey(query);
  const nextSnapshots = pruneOfflineHeatmapSnapshots([
    ...payload.heatmapSnapshots.filter(
      (current) => territoryHeatmapSnapshotKey(current.query) !== snapshotKey,
    ),
    snapshot,
  ]);
  const nextPayload: VaultContextPayload = {
    ...payload,
    schemaVersion: 4,
    heatmapSnapshots: nextSnapshots,
  };
  if (encodedJsonBytes(nextPayload) > MAX_VAULT_CONTEXT_BYTES) {
    throw new OfflineVaultError(
      "La bóveda no tiene capacidad para guardar esta vista territorial.",
    );
  }
  const metadata = { ...record, updatedAt: now.toISOString() };
  const replacement = await sealRecord(
    session,
    copyRecordMetadata(metadata),
    nextPayload,
  );
  if (!(await session.store.replaceIfUnchanged(record, replacement))) {
    throw new OfflineVaultError(
      "La bóveda cambió en otra ventana. Vuelve a guardar esta vista.",
    );
  }
  return structuredClone(snapshot);
}

export async function readOfflineHeatmapSnapshot(
  session: OfflineVaultSession,
  queryInput: TerritoryHeatmapQuery,
): Promise<TerritoryHeatmapSnapshot | null> {
  let query: TerritoryHeatmapQuery;
  try {
    query = validateTerritoryHeatmapQuery(queryInput);
  } catch {
    throw new OfflineVaultError(
      "La vista territorial solicitada no es válida.",
    );
  }
  const { payload } = await readContextPayload(session);
  const key = territoryHeatmapSnapshotKey(query);
  const snapshot = payload.heatmapSnapshots.find(
    (current) => territoryHeatmapSnapshotKey(current.query) === key,
  );
  return snapshot ? structuredClone(snapshot) : null;
}

export async function listOfflineHeatmapSnapshots(
  session: OfflineVaultSession,
): Promise<TerritoryHeatmapSnapshot[]> {
  const { payload } = await readContextPayload(session);
  return payload.heatmapSnapshots
    .map((snapshot) => validateHeatmapSnapshotForStorage(snapshot))
    .sort(
      (left, right) =>
        right.savedAt.localeCompare(left.savedAt) ||
        territoryHeatmapSnapshotKey(left.query).localeCompare(
          territoryHeatmapSnapshotKey(right.query),
        ),
    )
    .map((snapshot) => structuredClone(snapshot));
}

function normalizeVoterInput(input: CreateVoterInput): CreateVoterInput {
  const documentId = input.documentId.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const puestoId = input.puestoId?.trim();
  const termsVersion = input.termsVersion.trim();
  const channels = new Set(["WEB_FORM", "PAPER", "PHONE", "IN_PERSON"]);
  if (
    !/^[\p{L}\p{N}.-]{1,30}$/u.test(documentId) ||
    firstName.length === 0 ||
    firstName.length > 100 ||
    lastName.length === 0 ||
    lastName.length > 100 ||
    !puestoId ||
    puestoId.length > 128 ||
    input.consentAccepted !== true ||
    !/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,31}$/u.test(termsVersion) ||
    !channels.has(input.collectionChannel) ||
    (input.mesa !== undefined &&
      (!Number.isInteger(input.mesa) ||
        input.mesa < 1 ||
        input.mesa > 99_999)) ||
    (input.phone !== undefined && input.phone.trim().length > 24) ||
    (input.email !== undefined &&
      (input.email.trim().length > 254 || !input.email.includes("@")))
  ) {
    throw new OfflineVaultError(
      "La captura no cumple el contrato permitido para sincronización offline.",
    );
  }
  return {
    documentId,
    firstName,
    lastName,
    puestoId,
    consentAccepted: true,
    termsVersion,
    collectionChannel: input.collectionChannel,
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim().toLowerCase() } : {}),
    ...(input.mesa !== undefined ? { mesa: input.mesa } : {}),
  };
}

function validateCapturedAt(value: string, now: Date): string {
  if (
    !isTimestamp(value) ||
    Date.parse(value) > now.getTime() + CAPTURE_CLOCK_SKEW_MS
  ) {
    throw new OfflineVaultError("La fecha de captura offline no es válida.");
  }
  return new Date(value).toISOString();
}

export async function enqueueOfflineVoter(
  session: OfflineVaultSession,
  inputValue: CreateVoterInput,
  capturedAtValue = new Date().toISOString(),
  now = new Date(),
): Promise<string> {
  const input = normalizeVoterInput(inputValue);
  const capturedAt = validateCapturedAt(capturedAtValue, now);
  const context = await readOfflineCaptureContext(session);
  const notice = context?.consentNotice;
  if (
    !context ||
    !notice ||
    !context.puestos.some((puesto) => puesto.id === input.puestoId) ||
    notice.version !== input.termsVersion ||
    Date.parse(capturedAt) < Date.parse(notice.activatedAt)
  ) {
    throw new OfflineVaultError(
      "La captura no coincide con el contexto territorial y el aviso provisionados.",
    );
  }

  const metadata = newRecordMetadata("VOTER_CAPTURE", capturedAt, now);
  const payload: VoterQueuePayload = {
    kind: "VOTER_CAPTURE",
    schemaVersion: 1,
    clientOperationId: metadata.id,
    capturedAt,
    input,
    lastError: null,
    receipt: null,
  };
  await session.store.put(await sealRecord(session, metadata, payload));
  return metadata.id;
}

function normalizeOfflineIncidentInput(
  value: OfflineIncidentInput,
  now: Date,
): OfflineIncidentInput {
  if (!isRecord(value)) {
    throw new OfflineVaultError(
      "El incidente no cumple el contrato offline permitido.",
    );
  }
  const allowedKeys = new Set([
    "category",
    "priority",
    "title",
    "description",
    "occurredOn",
    "divisionId",
  ]);
  const title = String(value.title ?? "").trim();
  const description = String(value.description ?? "").trim();
  const occurredOn = String(value.occurredOn ?? "").trim();
  const divisionId = value.divisionId?.trim();
  if (
    Object.keys(value).some((key) => !allowedKeys.has(key)) ||
    !(OFFLINE_INCIDENT_CATEGORIES as readonly string[]).includes(
      value.category,
    ) ||
    !(OFFLINE_INCIDENT_PRIORITIES as readonly string[]).includes(
      value.priority,
    ) ||
    title.length < 3 ||
    title.length > 200 ||
    description.length < 10 ||
    description.length > 5_000 ||
    !isCivilDate(occurredOn) ||
    occurredOn > now.toISOString().slice(0, 10) ||
    (divisionId !== undefined &&
      (!/^[A-Za-z0-9_-]+$/.test(divisionId) || divisionId.length > 128))
  ) {
    throw new OfflineVaultError(
      "El incidente no cumple el contrato offline permitido.",
    );
  }
  return {
    category: value.category,
    priority: value.priority,
    title,
    description,
    occurredOn,
    ...(divisionId ? { divisionId } : {}),
  };
}

export async function enqueueOfflineIncident(
  session: OfflineVaultSession,
  inputValue: OfflineIncidentInput,
  capturedAtValue = new Date().toISOString(),
  now = new Date(),
): Promise<string> {
  const input = normalizeOfflineIncidentInput(inputValue, now);
  const capturedAt = validateCapturedAt(capturedAtValue, now);
  const context = await readOfflineIncidentContext(session);
  if (
    !context ||
    !context.categories.includes(input.category) ||
    !context.priorities.includes(input.priority) ||
    (context.requiresTerritory && !input.divisionId) ||
    (input.divisionId &&
      !context.territories.some((item) => item.id === input.divisionId))
  ) {
    throw new OfflineVaultError(
      "El incidente no coincide con el rol y territorio provisionados.",
    );
  }
  const activeIncidentCount = (await session.store.list()).filter(
    (record) => record.type === "INCIDENT_REPORT" && record.state !== "APPLIED",
  ).length;
  if (activeIncidentCount >= 100) {
    throw new OfflineVaultError(
      "La cola alcanzo 100 incidentes. Sincroniza o revisa pendientes antes de continuar.",
    );
  }
  const metadata = newRecordMetadata("INCIDENT_REPORT", capturedAt, now);
  const payloadSha256 = await computeOfflineIncidentSha256({
    clientOperationId: metadata.id,
    capturedAt,
    ...input,
  });
  const payload: IncidentQueuePayload = {
    kind: "INCIDENT_REPORT",
    schemaVersion: 1,
    clientOperationId: metadata.id,
    capturedAt,
    payloadSha256,
    input,
    lastError: null,
    receipt: null,
  };
  await session.store.put(await sealRecord(session, metadata, payload));
  return metadata.id;
}

const E14_FILE_TYPES: Readonly<
  Record<string, readonly ("jpg" | "jpeg" | "png" | "webp" | "pdf")[]>
> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};

function e14FileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : "";
}

function assertE14FileMetadata(file: Pick<File, "name" | "type" | "size">) {
  const extension = e14FileExtension(file.name);
  const allowedExtensions = E14_FILE_TYPES[file.type];
  if (
    !allowedExtensions ||
    !allowedExtensions.includes(
      extension as (typeof allowedExtensions)[number],
    ) ||
    file.size < 1 ||
    file.size > OFFLINE_E14_MAX_FILE_BYTES ||
    file.name.length > 180 ||
    /[\\/\u0000-\u001f\u007f]/u.test(file.name)
  ) {
    throw new OfflineVaultError(
      "El E-14 debe ser JPG, JPEG, PNG, WEBP o PDF y no superar 15 MiB.",
    );
  }
  return extension;
}

function hasBytePrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return (
    bytes.length >= prefix.length &&
    prefix.every((byte, index) => bytes[index] === byte)
  );
}

function assertE14FileSignature(bytes: Uint8Array, contentType: string): void {
  const valid =
    (contentType === "image/jpeg" &&
      hasBytePrefix(bytes, [0xff, 0xd8, 0xff])) ||
    (contentType === "image/png" &&
      hasBytePrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (contentType === "image/webp" &&
      hasBytePrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      hasBytePrefix(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) ||
    (contentType === "application/pdf" &&
      hasBytePrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]));
  if (!valid) {
    throw new OfflineVaultError(
      "El contenido del archivo no coincide con el tipo E-14 declarado.",
    );
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    ownedArrayBuffer(bytes),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function normalizeOfflineE14Input(
  value: OfflineE14ReportInput,
  now: Date,
): OfflineE14ReportInput {
  if (!isRecord(value)) {
    throw new OfflineVaultError(
      "El reporte E-14 no cumple el contrato offline.",
    );
  }
  const allowedKeys = new Set([
    "puestoId",
    "mesa",
    "credentialType",
    "credentialReference",
    "checkedInAt",
    "e14FormType",
    "candidateVotes",
    "blankVotes",
    "nullVotes",
    "unmarkedVotes",
    "totalTableVotes",
    "hasWrittenClaim",
    "reclamationGround",
    "reclamationDescription",
    "observations",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new OfflineVaultError(
      "El reporte E-14 contiene campos no permitidos.",
    );
  }
  const puestoId = String(value.puestoId ?? "").trim();
  const credentialReference = String(value.credentialReference ?? "").trim();
  const checkedInAt = String(value.checkedInAt ?? "").trim();
  const observations = value.observations?.trim();
  const reclamationDescription = value.reclamationDescription?.trim();
  const voteValidation = validateWitnessVoteBreakdown({
    candidateVotes: value.candidateVotes,
    blankVotes: value.blankVotes,
    nullVotes: value.nullVotes,
    unmarkedVotes: value.unmarkedVotes,
    totalTableVotes: value.totalTableVotes,
  });
  if (
    !puestoId ||
    puestoId.length > 128 ||
    !Number.isInteger(value.mesa) ||
    value.mesa < 1 ||
    value.mesa > 99_999 ||
    !["E15", "E16"].includes(String(value.credentialType)) ||
    !credentialReference ||
    credentialReference.length > 120 ||
    !isTimestamp(checkedInAt) ||
    Date.parse(checkedInAt) > now.getTime() + WITNESS_CHECK_IN_CLOCK_SKEW_MS ||
    !["DELEGADOS", "CLAVEROS", "TRANSMISION"].includes(
      String(value.e14FormType),
    ) ||
    !voteValidation.valid ||
    typeof value.hasWrittenClaim !== "boolean" ||
    (observations !== undefined &&
      (observations.length === 0 || observations.length > 1_000))
  ) {
    throw new OfflineVaultError(
      "El reporte E-14 no cumple el contrato offline.",
    );
  }
  if (
    value.hasWrittenClaim &&
    (!value.reclamationGround ||
      ![
        "VOTERS_EXCEED_AUTHORIZED",
        "ARITHMETIC_ERROR",
        "CANDIDATE_IDENTIFICATION_ERROR",
        "INSUFFICIENT_JUROR_SIGNATURES",
        "RECOUNT_REQUEST",
        "UNAUTHORIZED_POLLING_PLACE",
        "ELECTION_ON_UNAUTHORIZED_DATE",
        "BALLOTS_DESTROYED_OR_LOST",
        "OTHER_STATUTORY_GROUND",
      ].includes(value.reclamationGround) ||
      !reclamationDescription ||
      reclamationDescription.length < 20 ||
      reclamationDescription.length > 2_000 ||
      (value.reclamationGround === "OTHER_STATUTORY_GROUND" &&
        !/(art(?:[íi]culo)?\.?|ley|decreto|numeral)\s+/iu.test(
          reclamationDescription,
        )))
  ) {
    throw new OfflineVaultError(
      "La reclamacion escrita requiere causal y descripcion validas.",
    );
  }
  if (
    !value.hasWrittenClaim &&
    (value.reclamationGround !== undefined ||
      value.reclamationDescription !== undefined)
  ) {
    throw new OfflineVaultError(
      "No envies causal si no hubo reclamacion escrita.",
    );
  }
  return {
    puestoId,
    mesa: value.mesa,
    credentialType: value.credentialType as WitnessCredentialType,
    credentialReference,
    checkedInAt: new Date(checkedInAt).toISOString(),
    e14FormType: value.e14FormType as E14FormType,
    candidateVotes: value.candidateVotes,
    blankVotes: value.blankVotes,
    nullVotes: value.nullVotes,
    unmarkedVotes: value.unmarkedVotes,
    totalTableVotes: value.totalTableVotes,
    hasWrittenClaim: value.hasWrittenClaim,
    ...(value.hasWrittenClaim
      ? {
          reclamationGround:
            value.reclamationGround as WitnessReclamationGround,
          reclamationDescription,
        }
      : {}),
    ...(observations ? { observations } : {}),
  };
}

export async function enqueueOfflineE14(
  session: OfflineVaultSession,
  inputValue: OfflineE14ReportInput,
  file: File,
  capturedAtValue = new Date().toISOString(),
  now = new Date(),
): Promise<string> {
  const grant = await readOfflineE14Grant(session);
  if (!grant) {
    throw new OfflineVaultError(
      "Provisiona online una capacidad E-14 antes de salir sin conexion.",
    );
  }
  const capturedAt = validateCapturedAt(capturedAtValue, now);
  const input = normalizeOfflineE14Input(inputValue, now);
  const place = grant.places.find(
    (candidate) => candidate.id === input.puestoId,
  );
  if (
    !place ||
    input.mesa > place.expectedTables ||
    Date.parse(capturedAt) <
      Date.parse(grant.issuedAt) - CAPTURE_CLOCK_SKEW_MS ||
    Date.parse(capturedAt) > Date.parse(grant.expiresAt) ||
    now.getTime() >= Date.parse(grant.expiresAt)
  ) {
    throw new OfflineVaultError(
      "La captura no coincide con la vigencia, el puesto o las mesas provisionadas.",
    );
  }
  if (
    grant.captureContext === "REAL" &&
    (!place.votingDate ||
      !place.timeZone ||
      dateKeyInTimeZone(capturedAt, place.timeZone) !== place.votingDate)
  ) {
    throw new OfflineVaultError(
      "La captura REAL no coincide con la fecha local y zona horaria documentadas del puesto. Conserva la evidencia y solicita una capacidad vigente.",
    );
  }
  const extension = assertE14FileMetadata(file);
  const metadata = newRecordMetadata("E14_REPORT", capturedAt, now);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (bytes.byteLength !== file.size) {
      throw new OfflineVaultError(
        "El navegador reporto un tamano de evidencia inconsistente.",
      );
    }
    assertE14FileSignature(bytes, file.type);
    const sha256 = await sha256Hex(bytes);
    const existingE14 = (await session.store.list()).filter(
      (record) => record.type === "E14_REPORT" && record.state !== "APPLIED",
    );
    let existingBytes = 0;
    for (const record of existingE14) {
      const payload = await decryptE14Record(session, record);
      existingBytes += payload.file.size;
    }
    if (
      existingE14.length >= OFFLINE_E14_MAX_QUEUE_ENTRIES ||
      existingBytes + file.size > OFFLINE_E14_MAX_TOTAL_BYTES
    ) {
      throw new OfflineVaultError(
        "La cola E-14 alcanzo el limite de 4 actas o 30 MiB. Sincroniza o elimina una evidencia antes de continuar.",
      );
    }
    const payload: E14QueuePayload = {
      kind: "E14_REPORT",
      schemaVersion: 3,
      clientOperationId: metadata.id,
      capturedAt,
      captureContext: grant.captureContext,
      captureGrant: grant.captureGrant,
      grantIssuedAt: grant.issuedAt,
      grantExpiresAt: grant.expiresAt,
      electionDate: grant.electionDate,
      votingStartDate: grant.votingStartDate,
      votingEndDate: grant.votingEndDate,
      electionWindowSha256: grant.electionWindowSha256,
      expectedTablesAtProvision: place.expectedTables,
      sourceLocationCodeAtProvision: place.sourceLocationCode,
      pollingPlaceVotingDate: place.votingDate,
      pollingPlaceTimeZone: place.timeZone,
      input,
      file: {
        fileName: `e14-${metadata.id}.${extension}`,
        contentType: file.type,
        size: file.size,
        sha256,
        bytesBase64: bytesToBase64(bytes),
      },
      upload: { path: null, confirmed: false },
      lastError: null,
      receipt: null,
    };
    await session.store.put(await sealRecord(session, metadata, payload));
    return metadata.id;
  } finally {
    bytes.fill(0);
  }
}

function validateQueueFailure(value: unknown): QueueFailure | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !["AUTH", "CONFLICT", "NETWORK", "SERVER", "VALIDATION"].includes(
      String(value.code),
    ) ||
    typeof value.message !== "string" ||
    value.message.length === 0 ||
    value.message.length > 300 ||
    !isTimestamp(value.at)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  return value as unknown as QueueFailure;
}

function validateReceipt(
  value: unknown,
  operationId: string,
  capturedAt: string,
  operationType: OfflineSyncReceipt["operationType"] = "VOTER_CAPTURE",
): OfflineSyncReceipt | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    value.received !== true ||
    typeof value.receiptId !== "string" ||
    value.receiptId.length === 0 ||
    value.receiptId.length > 256 ||
    value.clientOperationId !== operationId ||
    value.operationType !== operationType ||
    !["APPLIED", "DUPLICATE"].includes(String(value.status)) ||
    !isTimestamp(value.capturedAt) ||
    new Date(value.capturedAt).toISOString() !== capturedAt ||
    !isTimestamp(value.receivedAt)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  return value as unknown as OfflineSyncReceipt;
}

function validateVoterQueuePayload(
  value: unknown,
  record: StoredVaultRecord,
): VoterQueuePayload {
  if (
    !isRecord(value) ||
    value.kind !== "VOTER_CAPTURE" ||
    value.schemaVersion !== 1 ||
    value.clientOperationId !== record.id ||
    value.capturedAt !== record.capturedAt ||
    !isRecord(value.input)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  let input: CreateVoterInput;
  try {
    input = normalizeVoterInput(value.input as unknown as CreateVoterInput);
  } catch {
    throw new OfflineVaultIntegrityError();
  }
  const lastError = validateQueueFailure(value.lastError);
  const receipt = validateReceipt(
    value.receipt,
    record.id,
    record.capturedAt!,
    "VOTER_CAPTURE",
  );
  if (
    (record.state === "APPLIED") !== (receipt !== null) ||
    (record.state === "CONFLICT" && lastError?.code !== "CONFLICT") ||
    (record.state === "FAILED" && lastError === null)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  return {
    kind: "VOTER_CAPTURE",
    schemaVersion: 1,
    clientOperationId: record.id,
    capturedAt: record.capturedAt!,
    input,
    lastError,
    receipt,
  };
}

async function decryptVoterRecord(
  session: OfflineVaultSession,
  record: StoredVaultRecord,
): Promise<VoterQueuePayload> {
  if (record.type !== "VOTER_CAPTURE") {
    throw new OfflineVaultIntegrityError();
  }
  const decrypted = await decryptOfflineVaultPayload(
    session.passwordKey,
    session.partitionHash,
    record,
  );
  return validateVoterQueuePayload(decrypted, record);
}

async function validateIncidentQueuePayload(
  value: unknown,
  record: StoredVaultRecord,
): Promise<IncidentQueuePayload> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "kind",
      "schemaVersion",
      "clientOperationId",
      "capturedAt",
      "payloadSha256",
      "input",
      "lastError",
      "receipt",
    ]) ||
    value.kind !== "INCIDENT_REPORT" ||
    value.schemaVersion !== 1 ||
    value.clientOperationId !== record.id ||
    value.capturedAt !== record.capturedAt ||
    typeof value.payloadSha256 !== "string" ||
    !SHA256_PATTERN.test(value.payloadSha256) ||
    !isRecord(value.input)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  let input: OfflineIncidentInput;
  try {
    input = normalizeOfflineIncidentInput(
      value.input as unknown as OfflineIncidentInput,
      new Date(),
    );
  } catch {
    throw new OfflineVaultIntegrityError();
  }
  const calculatedSha256 = await computeOfflineIncidentSha256({
    clientOperationId: record.id,
    capturedAt: record.capturedAt!,
    ...input,
  });
  if (calculatedSha256 !== value.payloadSha256) {
    throw new OfflineVaultIntegrityError();
  }
  const lastError = validateQueueFailure(value.lastError);
  const receiptValue = validateReceipt(
    value.receipt,
    record.id,
    record.capturedAt!,
    "INCIDENT_REPORT",
  );
  const receipt = receiptValue as OfflineIncidentSyncReceipt | null;
  if (
    receipt &&
    (!isRecord(receipt) || receipt.payloadSha256 !== calculatedSha256)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  if (
    (record.state === "APPLIED") !== (receipt !== null) ||
    (record.state === "CONFLICT" && lastError?.code !== "CONFLICT") ||
    (record.state === "FAILED" && lastError === null)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  return {
    kind: "INCIDENT_REPORT",
    schemaVersion: 1,
    clientOperationId: record.id,
    capturedAt: record.capturedAt!,
    payloadSha256: calculatedSha256,
    input,
    lastError,
    receipt,
  };
}

async function decryptIncidentRecord(
  session: OfflineVaultSession,
  record: StoredVaultRecord,
): Promise<IncidentQueuePayload> {
  if (record.type !== "INCIDENT_REPORT") {
    throw new OfflineVaultIntegrityError();
  }
  const decrypted = await decryptOfflineVaultPayload(
    session.passwordKey,
    session.partitionHash,
    record,
  );
  return validateIncidentQueuePayload(decrypted, record);
}

function isCanonicalE14Path(
  tenantId: string,
  path: string,
  extension: string,
): boolean {
  const prefix = `${tenantId}/e14/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return new RegExp(
    `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.${extension.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    "i",
  ).test(name);
}

async function validateE14QueuePayload(
  value: unknown,
  record: StoredVaultRecord,
  tenantId: string,
): Promise<E14QueuePayload> {
  const legacyKeys = [
    "kind",
    "schemaVersion",
    "clientOperationId",
    "capturedAt",
    "captureContext",
    "captureGrant",
    "grantIssuedAt",
    "grantExpiresAt",
    "electionDate",
    "expectedTablesAtProvision",
    "input",
    "file",
    "upload",
    "lastError",
    "receipt",
  ];
  const currentKeys = [
    ...legacyKeys,
    "votingStartDate",
    "votingEndDate",
    "electionWindowSha256",
  ];
  const versionThreeKeys = [
    ...currentKeys,
    "sourceLocationCodeAtProvision",
    "pollingPlaceVotingDate",
    "pollingPlaceTimeZone",
  ];
  const legacy =
    isRecord(value) &&
    value.schemaVersion === 1 &&
    hasExactKeys(value, legacyKeys);
  const versionTwo =
    isRecord(value) &&
    value.schemaVersion === 2 &&
    hasExactKeys(value, currentKeys);
  const current =
    isRecord(value) &&
    value.schemaVersion === 3 &&
    hasExactKeys(value, versionThreeKeys);
  if (
    !isRecord(value) ||
    (!legacy && !versionTwo && !current) ||
    value.kind !== "E14_REPORT" ||
    value.clientOperationId !== record.id ||
    value.capturedAt !== record.capturedAt ||
    !["SIMULATION", "REAL"].includes(String(value.captureContext)) ||
    typeof value.captureGrant !== "string" ||
    !E14_GRANT_PATTERN.test(value.captureGrant) ||
    !isTimestamp(value.grantIssuedAt) ||
    !isTimestamp(value.grantExpiresAt) ||
    !isCivilDate(value.electionDate) ||
    !Number.isSafeInteger(value.expectedTablesAtProvision) ||
    (value.expectedTablesAtProvision as number) < 1 ||
    (value.expectedTablesAtProvision as number) > 99_999 ||
    !isRecord(value.input) ||
    !isRecord(value.file) ||
    !isRecord(value.upload)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const votingStartDate = legacy ? value.electionDate : value.votingStartDate;
  const votingEndDate = legacy ? value.electionDate : value.votingEndDate;
  const electionWindowSha256 = legacy
    ? LEGACY_ELECTION_WINDOW_SHA256
    : value.electionWindowSha256;
  if (
    !isValidElectionWindow(
      value.electionDate,
      votingStartDate,
      votingEndDate,
    ) ||
    typeof electionWindowSha256 !== "string" ||
    !SHA256_PATTERN.test(electionWindowSha256)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const sourceLocationCodeAtProvision = current
    ? value.sourceLocationCodeAtProvision
    : null;
  const pollingPlaceVotingDate = current ? value.pollingPlaceVotingDate : null;
  const pollingPlaceTimeZone = current ? value.pollingPlaceTimeZone : null;
  if (
    !(
      sourceLocationCodeAtProvision === null ||
      (typeof sourceLocationCodeAtProvision === "string" &&
        /^[0-9]{1,32}$/.test(sourceLocationCodeAtProvision))
    ) ||
    !(pollingPlaceVotingDate === null || isCivilDate(pollingPlaceVotingDate)) ||
    !(pollingPlaceTimeZone === null || isIanaTimeZone(pollingPlaceTimeZone)) ||
    (current &&
      value.captureContext === "REAL" &&
      (!isCivilDate(pollingPlaceVotingDate) ||
        !isIanaTimeZone(pollingPlaceTimeZone) ||
        dateKeyInTimeZone(record.capturedAt!, pollingPlaceTimeZone) !==
          pollingPlaceVotingDate))
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const capturedAt = Date.parse(record.capturedAt!);
  if (
    capturedAt < Date.parse(value.grantIssuedAt) - CAPTURE_CLOCK_SKEW_MS ||
    capturedAt > Date.parse(value.grantExpiresAt)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  let input: OfflineE14ReportInput;
  try {
    input = normalizeOfflineE14Input(
      value.input as unknown as OfflineE14ReportInput,
      new Date(capturedAt),
    );
  } catch {
    throw new OfflineVaultIntegrityError();
  }
  if (input.mesa > (value.expectedTablesAtProvision as number)) {
    throw new OfflineVaultIntegrityError();
  }
  if (
    !hasExactKeys(value.file, [
      "fileName",
      "contentType",
      "size",
      "sha256",
      "bytesBase64",
    ]) ||
    typeof value.file.fileName !== "string" ||
    typeof value.file.contentType !== "string" ||
    !Number.isSafeInteger(value.file.size) ||
    (value.file.size as number) < 1 ||
    (value.file.size as number) > OFFLINE_E14_MAX_FILE_BYTES ||
    typeof value.file.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.file.sha256) ||
    typeof value.file.bytesBase64 !== "string" ||
    value.file.bytesBase64.length >
      Math.ceil(OFFLINE_E14_MAX_FILE_BYTES / 3) * 4 + 4
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const extension = e14FileExtension(value.file.fileName);
  if (
    value.file.fileName !== `e14-${record.id}.${extension}` ||
    !E14_FILE_TYPES[value.file.contentType]?.includes(
      extension as "jpg" | "jpeg" | "png" | "webp" | "pdf",
    )
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const bytes = base64ToBytes(value.file.bytesBase64);
  try {
    if (bytes.byteLength !== value.file.size) {
      throw new OfflineVaultIntegrityError();
    }
    try {
      assertE14FileSignature(bytes, value.file.contentType);
    } catch {
      throw new OfflineVaultIntegrityError();
    }
    if ((await sha256Hex(bytes)) !== value.file.sha256) {
      throw new OfflineVaultIntegrityError();
    }
  } finally {
    bytes.fill(0);
  }
  if (
    !hasExactKeys(value.upload, ["path", "confirmed"]) ||
    !(value.upload.path === null || typeof value.upload.path === "string") ||
    typeof value.upload.confirmed !== "boolean" ||
    (value.upload.confirmed && value.upload.path === null) ||
    (typeof value.upload.path === "string" &&
      !isCanonicalE14Path(tenantId, value.upload.path, extension))
  ) {
    throw new OfflineVaultIntegrityError();
  }
  const lastError = validateQueueFailure(value.lastError);
  const receiptValue = validateReceipt(
    value.receipt,
    record.id,
    record.capturedAt!,
    "E14_REPORT",
  );
  const receipt = receiptValue as OfflineE14SyncReceipt | null;
  if (
    receipt &&
    (!isRecord(receipt) || receipt.captureContext !== value.captureContext)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  if (
    (record.state === "APPLIED") !== (receipt !== null) ||
    (record.state === "CONFLICT" && lastError?.code !== "CONFLICT") ||
    (record.state === "FAILED" && lastError === null)
  ) {
    throw new OfflineVaultIntegrityError();
  }
  return {
    kind: "E14_REPORT",
    schemaVersion: 3,
    clientOperationId: record.id,
    capturedAt: record.capturedAt!,
    captureContext: value.captureContext as ActiveWitnessCaptureContext,
    captureGrant: value.captureGrant,
    grantIssuedAt: new Date(value.grantIssuedAt).toISOString(),
    grantExpiresAt: new Date(value.grantExpiresAt).toISOString(),
    electionDate: value.electionDate,
    votingStartDate: votingStartDate as string,
    votingEndDate: votingEndDate as string,
    electionWindowSha256,
    expectedTablesAtProvision: value.expectedTablesAtProvision as number,
    sourceLocationCodeAtProvision: sourceLocationCodeAtProvision as
      | string
      | null,
    pollingPlaceVotingDate: pollingPlaceVotingDate as string | null,
    pollingPlaceTimeZone: pollingPlaceTimeZone as string | null,
    input,
    file: {
      fileName: value.file.fileName,
      contentType: value.file.contentType,
      size: value.file.size as number,
      sha256: value.file.sha256,
      bytesBase64: value.file.bytesBase64,
    },
    upload: {
      path: value.upload.path as string | null,
      confirmed: value.upload.confirmed,
    },
    lastError,
    receipt,
  };
}

async function decryptE14Record(
  session: OfflineVaultSession,
  record: StoredVaultRecord,
): Promise<E14QueuePayload> {
  if (record.type !== "E14_REPORT") {
    throw new OfflineVaultIntegrityError();
  }
  const decrypted = await decryptOfflineVaultPayload(
    session.passwordKey,
    session.partitionHash,
    record,
  );
  return validateE14QueuePayload(decrypted, record, session.identity.tenantId);
}

async function decryptQueueRecord(
  session: OfflineVaultSession,
  record: StoredVaultRecord,
): Promise<QueuePayload> {
  return record.type === "VOTER_CAPTURE"
    ? decryptVoterRecord(session, record)
    : record.type === "INCIDENT_REPORT"
      ? decryptIncidentRecord(session, record)
      : record.type === "E14_REPORT"
        ? decryptE14Record(session, record)
        : Promise.reject(new OfflineVaultIntegrityError());
}

async function deleteVerifiedAppliedRecord(
  session: OfflineVaultSession,
  record: StoredVaultRecord,
  payload: QueuePayload,
): Promise<void> {
  if (record.state !== "APPLIED" || payload.receipt === null) {
    throw new OfflineVaultIntegrityError();
  }
  if (await session.store.deleteIfUnchanged(record)) return;
  if ((await session.store.get(record.id)) !== null) {
    throw new OfflineVaultIntegrityError();
  }
}

async function purgeAppliedQueueRecords(
  session: OfflineVaultSession,
): Promise<number> {
  let purged = 0;
  for (const record of await session.store.list()) {
    if (record.type === CONTEXT_TYPE || record.state !== "APPLIED") continue;
    const payload = await decryptQueueRecord(session, record);
    await deleteVerifiedAppliedRecord(session, record, payload);
    purged += 1;
  }
  return purged;
}

async function recoverStaleSyncingRecords(
  session: OfflineVaultSession,
  now: Date,
): Promise<number> {
  const cutoff = now.getTime() - STALE_SYNCING_MS;
  let recovered = 0;
  for (const record of await session.store.list()) {
    if (
      record.type === CONTEXT_TYPE ||
      record.state !== "SYNCING" ||
      Date.parse(record.updatedAt) > cutoff
    ) {
      continue;
    }
    const payload = await decryptQueueRecord(session, record);
    const metadata = copyRecordMetadata({
      ...record,
      state: "PENDING",
      updatedAt: now.toISOString(),
      nextAttemptAt: null,
    });
    const replacement = await sealRecord(session, metadata, payload);
    if (await session.store.replaceIfUnchanged(record, replacement)) {
      recovered += 1;
    }
  }
  return recovered;
}

export async function listOfflineQueue(
  session: OfflineVaultSession,
): Promise<OfflineQueueSummary[]> {
  await readContextPayload(session);
  const records = await session.store.list();
  const summaries: OfflineQueueSummary[] = [];
  for (const record of records) {
    if (record.type === CONTEXT_TYPE) continue;
    const payload = await decryptQueueRecord(session, record);
    if (record.state === "APPLIED") {
      await deleteVerifiedAppliedRecord(session, record, payload);
      continue;
    }
    summaries.push({
      id: record.id,
      type: record.type,
      state: record.state,
      capturedAt: payload.capturedAt,
      createdAt: record.createdAt,
      attempts: record.attempts,
      nextAttemptAt: record.nextAttemptAt,
      lastError: payload.lastError,
      ...(payload.kind === "E14_REPORT"
        ? {
            captureContext: payload.captureContext,
            evidenceBytes: payload.file.size,
          }
        : {}),
    });
  }
  return summaries;
}

async function updateQueueRecord(
  session: OfflineVaultSession,
  record: StoredVaultRecord,
  payload: QueuePayload,
  patch: Partial<
    Pick<
      StoredVaultRecord,
      "state" | "updatedAt" | "attempts" | "nextAttemptAt" | "lastAttemptAt"
    >
  >,
): Promise<StoredVaultRecord> {
  const metadata = { ...record, ...patch };
  const recordMetadata = copyRecordMetadata(metadata);
  const replacement = await sealRecord(session, recordMetadata, payload);
  if (!(await session.store.replaceIfUnchanged(record, replacement))) {
    throw new OfflineVaultIntegrityError();
  }
  return replacement;
}

export async function deleteOfflineQueueRecord(
  session: OfflineVaultSession,
  id: string,
): Promise<void> {
  const record = await session.store.get(id);
  if (!record || record.type === CONTEXT_TYPE) {
    throw new OfflineVaultError("La operación seleccionada no existe.");
  }
  if (record.state === "SYNCING") {
    throw new OfflineVaultError(
      "No se puede eliminar una operación mientras está sincronizando.",
    );
  }
  await decryptQueueRecord(session, record);
  if (!(await session.store.deleteIfUnchanged(record))) {
    throw new OfflineVaultError(
      "La operación cambió en otra ventana. Revísala antes de eliminarla.",
    );
  }
}

export async function retryFailedOfflineQueueRecord(
  session: OfflineVaultSession,
  id: string,
  now = new Date(),
): Promise<void> {
  const record = await session.store.get(id);
  if (!record || record.type === CONTEXT_TYPE || record.state !== "FAILED") {
    throw new OfflineVaultError(
      "Solo una operación fallida puede reintentarse.",
    );
  }
  const payload = await decryptQueueRecord(session, record);
  await updateQueueRecord(
    session,
    record,
    { ...payload, lastError: null },
    {
      state: "PENDING",
      updatedAt: now.toISOString(),
      nextAttemptAt: null,
    },
  );
}

export function offlineSyncBackoffMilliseconds(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) return 30_000;
  return Math.min(30_000 * 2 ** Math.min(attempt - 1, 10), 30 * 60 * 1_000);
}

function errorStatus(error: unknown): number {
  if (!isRecord(error)) return 0;
  const status = Number(error.status);
  return Number.isInteger(status) ? status : 0;
}

function queueFailure(status: number, at: string): QueueFailure {
  if (status === 409) {
    return {
      code: "CONFLICT",
      message: "La API informó un conflicto que requiere revisión manual.",
      at,
    };
  }
  if (status === 0) {
    return {
      code: "NETWORK",
      message: "No hubo conexión verificable con la API.",
      at,
    };
  }
  if (status >= 400 && status < 500) {
    return {
      code: "VALIDATION",
      message: `La API rechazó la operación con estado ${status}.`,
      at,
    };
  }
  return {
    code: "SERVER",
    message: `La API no pudo aplicar la operación${status ? ` (estado ${status})` : ""}.`,
    at,
  };
}

function requireE14SyncDependencies(dependencies: OfflineSyncDependencies) {
  if (
    !dependencies.authorizeE14 ||
    !dependencies.uploadE14 ||
    !dependencies.confirmE14 ||
    !dependencies.sendE14
  ) {
    throw new OfflineVaultError(
      "La sincronizacion E-14 no esta configurada en esta aplicacion.",
    );
  }
  return {
    authorize: dependencies.authorizeE14,
    upload: dependencies.uploadE14,
    confirm: dependencies.confirmE14,
    send: dependencies.sendE14,
  };
}

function requireIncidentSyncDependency(
  dependencies: OfflineSyncDependencies,
): NonNullable<OfflineSyncDependencies["sendIncident"]> {
  if (!dependencies.sendIncident) {
    throw new OfflineVaultError(
      "La sincronizacion de incidentes no esta configurada en esta aplicacion.",
    );
  }
  return dependencies.sendIncident;
}

async function fileFromE14Payload(payload: E14QueuePayload): Promise<File> {
  const bytes = base64ToBytes(payload.file.bytesBase64);
  try {
    if (
      bytes.byteLength !== payload.file.size ||
      (await sha256Hex(bytes)) !== payload.file.sha256
    ) {
      throw new OfflineVaultIntegrityError();
    }
    try {
      assertE14FileSignature(bytes, payload.file.contentType);
    } catch {
      throw new OfflineVaultIntegrityError();
    }
    return new File([ownedArrayBuffer(bytes)], payload.file.fileName, {
      type: payload.file.contentType,
      lastModified: Date.parse(payload.capturedAt),
    });
  } finally {
    bytes.fill(0);
  }
}

function assertE14UploadAuthorization(
  session: OfflineVaultSession,
  payload: E14QueuePayload,
  authorization: UploadAuthorization,
): void {
  const extension = e14FileExtension(payload.file.fileName);
  let url: URL;
  try {
    url = new URL(authorization.uploadUrl);
  } catch {
    throw new OfflineVaultError(
      "La API devolvio una autorizacion E-14 invalida.",
    );
  }
  const secureUrl =
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname.toLowerCase()));
  const contentTypeHeader = Object.entries(authorization.headers).find(
    ([name]) => name.toLowerCase() === "content-type",
  )?.[1];
  if (
    !secureUrl ||
    !authorization.bucket?.trim() ||
    authorization.method !== "PUT" ||
    !authorization.uploadToken?.trim() ||
    authorization.uploadToken.length > 8_192 ||
    !isCanonicalE14Path(
      session.identity.tenantId,
      authorization.path,
      extension,
    ) ||
    contentTypeHeader !== payload.file.contentType ||
    authorization.metadata.fileName !== payload.file.fileName ||
    authorization.metadata.contentType !== payload.file.contentType ||
    authorization.metadata.size !== payload.file.size ||
    authorization.metadata.contentSha256 !== payload.file.sha256
  ) {
    throw new OfflineVaultError(
      "La API devolvio una autorizacion E-14 invalida.",
    );
  }
}

function e14UploadMetadata(
  payload: E14QueuePayload,
): UploadAuthorization["metadata"] {
  return {
    fileName: payload.file.fileName,
    contentType: payload.file.contentType,
    size: payload.file.size,
    contentSha256: payload.file.sha256,
  };
}

async function persistE14UploadProgress(
  session: OfflineVaultSession,
  record: StoredVaultRecord,
  payload: E14QueuePayload,
  upload: E14QueuePayload["upload"],
  now: Date,
): Promise<{ record: StoredVaultRecord; payload: E14QueuePayload }> {
  const nextPayload: E14QueuePayload = { ...payload, upload };
  const nextRecord = await updateQueueRecord(session, record, nextPayload, {
    updatedAt: now.toISOString(),
  });
  return { record: nextRecord, payload: nextPayload };
}

async function prepareE14EvidenceForSync(
  session: OfflineVaultSession,
  initialRecord: StoredVaultRecord,
  initialPayload: E14QueuePayload,
  dependencies: OfflineSyncDependencies,
  onProgress: (
    record: StoredVaultRecord,
    payload: E14QueuePayload,
  ) => void = () => undefined,
): Promise<{ record: StoredVaultRecord; payload: E14QueuePayload }> {
  const operations = requireE14SyncDependencies(dependencies);
  let record = initialRecord;
  let payload = initialPayload;
  const foreground = () => dependencies.ensureForeground?.();

  if (payload.upload.path && !payload.upload.confirmed) {
    foreground();
    try {
      const confirmation = await operations.confirm(
        payload.upload.path,
        e14UploadMetadata(payload),
      );
      if (
        confirmation.confirmed !== true ||
        confirmation.path !== payload.upload.path ||
        (confirmation.module !== undefined && confirmation.module !== "e14")
      ) {
        throw new OfflineVaultIntegrityError();
      }
      ({ record, payload } = await persistE14UploadProgress(
        session,
        record,
        payload,
        { path: payload.upload.path, confirmed: true },
        new Date(dependencies.now?.() ?? Date.now()),
      ));
      onProgress(record, payload);
    } catch (error) {
      const status = errorStatus(error);
      if (status !== 404 && status !== 409) throw error;
      ({ record, payload } = await persistE14UploadProgress(
        session,
        record,
        payload,
        { path: null, confirmed: false },
        new Date(dependencies.now?.() ?? Date.now()),
      ));
      onProgress(record, payload);
    }
  }

  if (!payload.upload.path) {
    foreground();
    const file = await fileFromE14Payload(payload);
    const authorization = await operations.authorize(file, payload.file.sha256);
    assertE14UploadAuthorization(session, payload, authorization);
    ({ record, payload } = await persistE14UploadProgress(
      session,
      record,
      payload,
      { path: authorization.path, confirmed: false },
      new Date(dependencies.now?.() ?? Date.now()),
    ));
    onProgress(record, payload);
    foreground();
    await operations.upload(file, authorization);
    foreground();
    const confirmation = await operations.confirm(
      authorization.path,
      authorization.metadata,
    );
    if (
      confirmation.confirmed !== true ||
      confirmation.path !== authorization.path ||
      (confirmation.module !== undefined && confirmation.module !== "e14")
    ) {
      throw new OfflineVaultIntegrityError();
    }
    ({ record, payload } = await persistE14UploadProgress(
      session,
      record,
      payload,
      { path: authorization.path, confirmed: true },
      new Date(dependencies.now?.() ?? Date.now()),
    ));
    onProgress(record, payload);
  }

  if (!payload.upload.path || !payload.upload.confirmed) {
    throw new OfflineVaultIntegrityError();
  }
  return { record, payload };
}

async function sendPreparedE14(
  payload: E14QueuePayload,
  dependencies: OfflineSyncDependencies,
): Promise<OfflineE14SyncReceipt> {
  if (!payload.upload.path || !payload.upload.confirmed) {
    throw new OfflineVaultIntegrityError();
  }
  dependencies.ensureForeground?.();
  const receipt = await requireE14SyncDependencies(dependencies).send({
    ...payload.input,
    e14ImageUrl: payload.upload.path,
    clientOperationId: payload.clientOperationId,
    capturedAt: payload.capturedAt,
    captureGrant: payload.captureGrant,
    evidenceSha256: payload.file.sha256,
  });
  const validated = validateReceipt(
    receipt,
    payload.clientOperationId,
    payload.capturedAt,
    "E14_REPORT",
  ) as OfflineE14SyncReceipt | null;
  if (!validated || validated.captureContext !== payload.captureContext) {
    throw new OfflineVaultIntegrityError();
  }
  return validated;
}

async function runOfflineQueueSynchronization(
  session: OfflineVaultSession,
  dependencies: OfflineSyncDependencies,
): Promise<OfflineSyncRunResult> {
  await readContextPayload(session);
  let authenticatedIdentity: OfflineVaultIdentity;
  try {
    authenticatedIdentity = normalizeIdentity(
      await dependencies.revalidateIdentity(),
    );
  } catch (error) {
    const status = errorStatus(error);
    if (status === 401 || status === 403) {
      throw new OfflineQueueAuthorizationError();
    }
    throw error;
  }
  if (!identitiesMatch(authenticatedIdentity, session.identity)) {
    throw new OfflineQueueAuthorizationError();
  }

  const result: OfflineSyncRunResult = {
    applied: 0,
    conflicts: 0,
    failed: 0,
    deferred: 0,
  };
  const records = await session.store.list();
  for (const listedRecord of records) {
    if (listedRecord.type === CONTEXT_TYPE) continue;
    let payload = await decryptQueueRecord(session, listedRecord);
    if (listedRecord.state === "APPLIED") {
      await deleteVerifiedAppliedRecord(session, listedRecord, payload);
      continue;
    }
    if (listedRecord.state !== "PENDING") continue;
    const now = new Date(dependencies.now?.() ?? Date.now());
    if (
      listedRecord.nextAttemptAt &&
      Date.parse(listedRecord.nextAttemptAt) > now.getTime()
    ) {
      result.deferred += 1;
      continue;
    }
    const claimedMetadata = copyRecordMetadata({
      ...listedRecord,
      state: "SYNCING",
      updatedAt: now.toISOString(),
      lastAttemptAt: now.toISOString(),
    });
    let record = await sealRecord(session, claimedMetadata, payload);
    if (!(await session.store.replaceIfUnchanged(listedRecord, record))) {
      continue;
    }
    const attempt = record.attempts + 1;
    try {
      if (payload.kind === "VOTER_CAPTURE") {
        dependencies.ensureForeground?.();
        const receiptValue = await dependencies.sendVoter({
          ...payload.input,
          clientOperationId: payload.clientOperationId,
          capturedAt: payload.capturedAt,
        });
        const receipt = validateReceipt(
          receiptValue,
          payload.clientOperationId,
          payload.capturedAt,
          "VOTER_CAPTURE",
        );
        if (!receipt) throw new OfflineVaultIntegrityError();
      } else if (payload.kind === "INCIDENT_REPORT") {
        dependencies.ensureForeground?.();
        const receiptValue = await requireIncidentSyncDependency(dependencies)({
          ...payload.input,
          clientOperationId: payload.clientOperationId,
          capturedAt: payload.capturedAt,
          payloadSha256: payload.payloadSha256,
        });
        const receipt = validateReceipt(
          receiptValue,
          payload.clientOperationId,
          payload.capturedAt,
          "INCIDENT_REPORT",
        ) as OfflineIncidentSyncReceipt | null;
        if (!receipt || receipt.payloadSha256 !== payload.payloadSha256) {
          throw new OfflineVaultIntegrityError();
        }
      } else {
        ({ record, payload } = await prepareE14EvidenceForSync(
          session,
          record,
          payload,
          dependencies,
          (progressRecord, progressPayload) => {
            record = progressRecord;
            payload = progressPayload;
          },
        ));
        await sendPreparedE14(payload, dependencies);
      }
      if (!(await session.store.deleteIfUnchanged(record))) {
        throw new OfflineVaultIntegrityError();
      }
      result.applied += 1;
    } catch (error) {
      if (error instanceof OfflineVaultIntegrityError) {
        await updateQueueRecord(session, record, payload, {
          state: "PENDING",
          updatedAt: now.toISOString(),
          nextAttemptAt: null,
        });
        throw error;
      }
      if (error instanceof OfflineQueueForegroundRequiredError) {
        await updateQueueRecord(session, record, payload, {
          state: "PENDING",
          updatedAt: now.toISOString(),
          nextAttemptAt: null,
        });
        throw error;
      }
      const status = errorStatus(error);
      if (status === 401 || status === 403) {
        await updateQueueRecord(session, record, payload, {
          state: "PENDING",
          updatedAt: now.toISOString(),
          nextAttemptAt: null,
        });
        throw new OfflineQueueAuthorizationError();
      }
      const failure = queueFailure(status, now.toISOString());
      if (status === 409) {
        await updateQueueRecord(
          session,
          record,
          { ...payload, lastError: failure },
          {
            state: "CONFLICT",
            attempts: attempt,
            updatedAt: now.toISOString(),
            nextAttemptAt: null,
          },
        );
        result.conflicts += 1;
        continue;
      }

      const transient =
        status === 0 ||
        status === 408 ||
        status === 425 ||
        status === 429 ||
        status >= 500;
      const failed = !transient || attempt >= OFFLINE_SYNC_MAX_ATTEMPTS;
      await updateQueueRecord(
        session,
        record,
        { ...payload, lastError: failure },
        {
          state: failed ? "FAILED" : "PENDING",
          attempts: attempt,
          updatedAt: now.toISOString(),
          nextAttemptAt: failed
            ? null
            : new Date(
                now.getTime() + offlineSyncBackoffMilliseconds(attempt),
              ).toISOString(),
        },
      );
      if (failed) result.failed += 1;
      else result.deferred += 1;
    }
  }
  return result;
}

export class OfflineQueueSynchronizer {
  private inFlight: Promise<OfflineSyncRunResult> | null = null;

  synchronize(
    session: OfflineVaultSession,
    dependencies: OfflineSyncDependencies,
  ): Promise<OfflineSyncRunResult> {
    if (this.inFlight) return this.inFlight;
    const operation = runOfflineQueueSynchronization(session, dependencies);
    const wrapped = operation.finally(() => {
      if (this.inFlight === wrapped) {
        this.inFlight = null;
      }
    });
    this.inFlight = wrapped;
    return wrapped;
  }
}
