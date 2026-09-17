"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAuth } from "./auth";
import { getCurrentAuthUser } from "@/lib/auth-api";
import {
  createOfflineVaultSession,
  clearOfflineE14Grant,
  deleteOfflineQueueRecord,
  deriveOfflineVaultPartition,
  enqueueOfflineE14,
  enqueueOfflineIncident,
  enqueueOfflineVoter,
  IndexedDbVaultRecordStore,
  inspectOfflineVaultStoragePersistence,
  listKnownOfflineVaults,
  listOfflineHeatmapSnapshots,
  listOfflineQueue,
  OfflineQueueAuthorizationError,
  OfflineQueueForegroundRequiredError,
  OfflineQueueSynchronizer,
  OfflineVaultError,
  OfflineVaultIntegrityError,
  provisionOfflineCaptureContext,
  provisionOfflineE14Grant,
  provisionOfflineIncidentContext,
  readOfflineCalendarSnapshot,
  readOfflineCaptureContext,
  readOfflineE14Grant,
  readOfflineIncidentContext,
  readOfflineHeatmapSnapshot,
  registerKnownOfflineVault,
  requestOfflineVaultStoragePersistence,
  retryFailedOfflineQueueRecord,
  saveOfflineHeatmapSnapshot,
  saveOfflineCalendarSnapshot,
  supportsSecureOfflineVault,
  unlockOfflineVaultSession,
  vaultHasContext,
  type OfflineQueueSummary,
  type OfflineSyncRunResult,
  type OfflineVaultIdentity,
  type OfflineVaultSession,
  type OfflineVaultStoragePersistence,
  type OfflineElectoralCalendarSnapshot,
} from "@/lib/offline-vault";
import {
  authorizeOfflineE14Evidence,
  confirmOfflineE14Evidence,
  provisionOfflineE14Grant as requestOfflineE14Grant,
  revokeOfflineE14Grants,
  syncOfflineE14,
  uploadOfflineE14Evidence,
  type OfflineE14CaptureGrant,
  type OfflineE14ReportInput,
} from "@/lib/offline-e14-api";
import {
  getOfflineIncidentCaptureContext,
  syncOfflineIncident,
  type OfflineIncidentCaptureContext,
  type OfflineIncidentInput,
} from "@/lib/offline-incidents-api";
import { getElectoralCalendarOverview } from "@/lib/electoral-calendar-api";
import type {
  TerritoryHeatmapQuery,
  TerritoryHeatmapResponse,
  TerritoryHeatmapSnapshot,
} from "@/lib/territory-heatmap";
import {
  syncOfflineVoter,
  type CreateVoterInput,
  type VoterCaptureContext,
} from "@/lib/voters-api";

export type OfflineVaultPhase =
  | "CHECKING"
  | "UNSUPPORTED"
  | "EMPTY"
  | "LOCKED"
  | "UNLOCKED";

interface OfflineVaultContextValue {
  phase: OfflineVaultPhase;
  isOnline: boolean;
  busy: boolean;
  message: string | null;
  error: string | null;
  knownPartitions: string[];
  selectedPartition: string | null;
  entries: OfflineQueueSummary[];
  captureContext: VoterCaptureContext | null;
  e14Grant: OfflineE14CaptureGrant | null;
  incidentContext: OfflineIncidentCaptureContext | null;
  electoralCalendarSnapshot: OfflineElectoralCalendarSnapshot | null;
  heatmapSnapshots: TerritoryHeatmapSnapshot[];
  storagePersistence: OfflineVaultStoragePersistence | "UNKNOWN";
  createVault(passphrase: string): Promise<void>;
  unlock(passphrase: string, partitionHash?: string): Promise<void>;
  lock(): void;
  selectPartition(partitionHash: string): void;
  provisionCaptureContext(context: VoterCaptureContext): Promise<void>;
  saveHeatmapSnapshot(
    query: TerritoryHeatmapQuery,
    response: TerritoryHeatmapResponse,
  ): Promise<TerritoryHeatmapSnapshot>;
  readHeatmapSnapshot(
    query: TerritoryHeatmapQuery,
  ): Promise<TerritoryHeatmapSnapshot | null>;
  enqueueVoter(input: CreateVoterInput, capturedAt?: string): Promise<string>;
  provisionE14(): Promise<void>;
  revokeE14(): Promise<void>;
  enqueueE14(
    input: OfflineE14ReportInput,
    file: File,
    capturedAt?: string,
  ): Promise<string>;
  provisionIncidents(): Promise<void>;
  enqueueIncident(
    input: OfflineIncidentInput,
    capturedAt?: string,
  ): Promise<string>;
  provisionCalendarSnapshot(): Promise<void>;
  synchronize(): Promise<OfflineSyncRunResult>;
  retry(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

interface VaultViewState {
  phase: OfflineVaultPhase;
  busy: boolean;
  message: string | null;
  error: string | null;
  knownPartitions: string[];
  selectedPartition: string | null;
  entries: OfflineQueueSummary[];
  captureContext: VoterCaptureContext | null;
  e14Grant: OfflineE14CaptureGrant | null;
  incidentContext: OfflineIncidentCaptureContext | null;
  electoralCalendarSnapshot: OfflineElectoralCalendarSnapshot | null;
  heatmapSnapshots: TerritoryHeatmapSnapshot[];
  storagePersistence: OfflineVaultStoragePersistence | "UNKNOWN";
  unlockedIdentityKey: string | null;
  unlockedWithAuthenticatedIdentity: boolean;
}

const INITIAL_STATE: VaultViewState = {
  phase: "CHECKING",
  busy: false,
  message: null,
  error: null,
  knownPartitions: [],
  selectedPartition: null,
  entries: [],
  captureContext: null,
  e14Grant: null,
  incidentContext: null,
  electoralCalendarSnapshot: null,
  heatmapSnapshots: [],
  storagePersistence: "UNKNOWN",
  unlockedIdentityKey: null,
  unlockedWithAuthenticatedIdentity: false,
};

const OfflineVaultContext = createContext<OfflineVaultContextValue | null>(
  null,
);

function identityKey(identity: OfflineVaultIdentity | null): string | null {
  return identity ? JSON.stringify([identity.tenantId, identity.userId]) : null;
}

function readableVaultError(error: unknown): string {
  if (error instanceof OfflineVaultError) return error.message;
  return "No fue posible completar la operación de la bóveda cifrada.";
}

function subscribeToConnectivity(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OfflineVaultProvider({ children }: { children: ReactNode }) {
  const { user, tenant, loading: authLoading } = useAuth();
  const currentIdentity = useMemo<OfflineVaultIdentity | null>(
    () =>
      user?.id && tenant?.id ? { tenantId: tenant.id, userId: user.id } : null,
    [tenant?.id, user?.id],
  );
  const currentIdentityKey = identityKey(currentIdentity);
  const [state, setState] = useState<VaultViewState>(INITIAL_STATE);
  const sessionRef = useRef<OfflineVaultSession | null>(null);
  const synchronizerRef = useRef<OfflineQueueSynchronizer | null>(null);
  const activeSyncAbortRef = useRef<AbortController | null>(null);
  const unlockedWithAuthenticationRef = useRef(false);
  const inspectionSequence = useRef(0);
  const isOnline = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );

  const closeForSecurityError = useCallback((error: unknown) => {
    if (
      !(error instanceof OfflineVaultIntegrityError) &&
      !(error instanceof OfflineQueueAuthorizationError)
    ) {
      return false;
    }
    sessionRef.current = null;
    synchronizerRef.current = null;
    activeSyncAbortRef.current?.abort();
    activeSyncAbortRef.current = null;
    unlockedWithAuthenticationRef.current = false;
    setState((current) => ({
      ...current,
      phase: "LOCKED",
      busy: false,
      entries: [],
      captureContext: null,
      e14Grant: null,
      incidentContext: null,
      electoralCalendarSnapshot: null,
      heatmapSnapshots: [],
      storagePersistence: "UNKNOWN",
      unlockedIdentityKey: null,
      unlockedWithAuthenticatedIdentity: false,
      message: null,
      error: error.message,
    }));
    return true;
  }, []);

  const refreshUnlocked = useCallback(
    async (session: OfflineVaultSession, message: string | null = null) => {
      try {
        const [
          entries,
          captureContext,
          e14Grant,
          incidentContext,
          electoralCalendarSnapshot,
          heatmapSnapshots,
        ] = await Promise.all([
          listOfflineQueue(session),
          readOfflineCaptureContext(session),
          readOfflineE14Grant(session),
          readOfflineIncidentContext(session),
          readOfflineCalendarSnapshot(session),
          listOfflineHeatmapSnapshots(session),
        ]);
        if (sessionRef.current !== session) return;
        setState((current) => ({
          ...current,
          phase: "UNLOCKED",
          busy: false,
          message,
          error: null,
          selectedPartition: session.partitionHash,
          knownPartitions: current.knownPartitions.includes(
            session.partitionHash,
          )
            ? current.knownPartitions
            : [...current.knownPartitions, session.partitionHash].sort(),
          entries,
          captureContext,
          e14Grant,
          incidentContext,
          electoralCalendarSnapshot,
          heatmapSnapshots,
          unlockedIdentityKey: identityKey(session.identity),
          unlockedWithAuthenticatedIdentity:
            unlockedWithAuthenticationRef.current,
        }));
      } catch (error) {
        closeForSecurityError(error);
        throw error;
      }
    },
    [closeForSecurityError],
  );

  useEffect(() => {
    if (authLoading) return;
    const sequence = ++inspectionSequence.current;

    void (async () => {
      if (!supportsSecureOfflineVault()) {
        activeSyncAbortRef.current?.abort();
        activeSyncAbortRef.current = null;
        sessionRef.current = null;
        synchronizerRef.current = null;
        unlockedWithAuthenticationRef.current = false;
        if (sequence === inspectionSequence.current) {
          setState({ ...INITIAL_STATE, phase: "UNSUPPORTED" });
        }
        return;
      }

      if (
        sessionRef.current &&
        identityKey(sessionRef.current.identity) === currentIdentityKey
      ) {
        return;
      }
      activeSyncAbortRef.current?.abort();
      activeSyncAbortRef.current = null;
      sessionRef.current = null;
      synchronizerRef.current = null;
      unlockedWithAuthenticationRef.current = false;

      try {
        const known = await listKnownOfflineVaults();
        let selectedPartition = known[0] ?? null;
        let hasCurrentVault = false;
        if (currentIdentity) {
          selectedPartition =
            await deriveOfflineVaultPartition(currentIdentity);
          const store = new IndexedDbVaultRecordStore(selectedPartition);
          hasCurrentVault = await vaultHasContext(store);
          if (hasCurrentVault && !known.includes(selectedPartition)) {
            await registerKnownOfflineVault(selectedPartition);
            known.push(selectedPartition);
            known.sort();
          }
        }
        if (sequence !== inspectionSequence.current) return;
        setState({
          ...INITIAL_STATE,
          phase:
            (currentIdentity && hasCurrentVault) ||
            (!currentIdentity && known.length > 0)
              ? "LOCKED"
              : "EMPTY",
          knownPartitions: known,
          selectedPartition,
        });
      } catch (error) {
        if (sequence !== inspectionSequence.current) return;
        setState({
          ...INITIAL_STATE,
          phase: "LOCKED",
          error: readableVaultError(error),
        });
      }
    })();
  }, [authLoading, currentIdentity, currentIdentityKey]);

  const createVault = useCallback(
    async (passphrase: string) => {
      if (!currentIdentity) {
        throw new OfflineVaultError(
          "Inicia sesión con conexión antes de crear una bóveda para este dispositivo.",
        );
      }
      const persistenceRequest = requestOfflineVaultStoragePersistence();
      setState((current) => ({ ...current, busy: true, error: null }));
      try {
        const partitionHash =
          await deriveOfflineVaultPartition(currentIdentity);
        const store = new IndexedDbVaultRecordStore(partitionHash);
        const session = await createOfflineVaultSession(
          store,
          currentIdentity,
          passphrase,
        );
        await registerKnownOfflineVault(partitionHash);
        sessionRef.current = session;
        synchronizerRef.current = new OfflineQueueSynchronizer();
        unlockedWithAuthenticationRef.current = true;
        const storagePersistence = await persistenceRequest;
        await refreshUnlocked(
          session,
          "Bóveda creada. Provisiona el contexto territorial antes de salir a campo.",
        );
        setState((current) => ({ ...current, storagePersistence }));
      } catch (error) {
        if (!closeForSecurityError(error)) {
          setState((current) => ({
            ...current,
            busy: false,
            error: readableVaultError(error),
          }));
        }
        throw error;
      }
    },
    [closeForSecurityError, currentIdentity, refreshUnlocked],
  );

  const unlock = useCallback(
    async (passphrase: string, requestedPartition?: string) => {
      const persistenceInspection = inspectOfflineVaultStoragePersistence();
      setState((current) => ({ ...current, busy: true, error: null }));
      try {
        const partitionHash = currentIdentity
          ? await deriveOfflineVaultPartition(currentIdentity)
          : (requestedPartition ?? state.selectedPartition);
        if (!partitionHash) {
          throw new OfflineVaultError(
            "No hay una bóveda conocida para desbloquear en este dispositivo.",
          );
        }
        const store = new IndexedDbVaultRecordStore(partitionHash);
        const session = await unlockOfflineVaultSession(
          store,
          passphrase,
          currentIdentity ?? undefined,
        );
        await registerKnownOfflineVault(partitionHash);
        sessionRef.current = session;
        synchronizerRef.current = new OfflineQueueSynchronizer();
        unlockedWithAuthenticationRef.current = currentIdentity !== null;
        const storagePersistence = await persistenceInspection;
        await refreshUnlocked(session, "Bóveda desbloqueada solo en memoria.");
        setState((current) => ({ ...current, storagePersistence }));
      } catch (error) {
        activeSyncAbortRef.current?.abort();
        activeSyncAbortRef.current = null;
        sessionRef.current = null;
        synchronizerRef.current = null;
        unlockedWithAuthenticationRef.current = false;
        setState((current) => ({
          ...current,
          phase: "LOCKED",
          busy: false,
          entries: [],
          captureContext: null,
          e14Grant: null,
          incidentContext: null,
          electoralCalendarSnapshot: null,
          heatmapSnapshots: [],
          storagePersistence: "UNKNOWN",
          unlockedIdentityKey: null,
          unlockedWithAuthenticatedIdentity: false,
          error: readableVaultError(error),
        }));
        throw error;
      }
    },
    [currentIdentity, refreshUnlocked, state.selectedPartition],
  );

  const lock = useCallback(() => {
    activeSyncAbortRef.current?.abort();
    activeSyncAbortRef.current = null;
    sessionRef.current = null;
    synchronizerRef.current = null;
    unlockedWithAuthenticationRef.current = false;
    setState((current) => ({
      ...current,
      phase: current.knownPartitions.length > 0 ? "LOCKED" : "EMPTY",
      busy: false,
      message: "Bóveda bloqueada. La clave salió de memoria.",
      error: null,
      entries: [],
      captureContext: null,
      e14Grant: null,
      incidentContext: null,
      electoralCalendarSnapshot: null,
      heatmapSnapshots: [],
      storagePersistence: "UNKNOWN",
      unlockedIdentityKey: null,
      unlockedWithAuthenticatedIdentity: false,
    }));
  }, []);

  useEffect(() => {
    const clearEphemeralKey = () => lock();
    const clearWhenHidden = () => {
      if (document.visibilityState === "hidden") lock();
    };
    window.addEventListener("pagehide", clearEphemeralKey);
    document.addEventListener("visibilitychange", clearWhenHidden);
    return () => {
      window.removeEventListener("pagehide", clearEphemeralKey);
      document.removeEventListener("visibilitychange", clearWhenHidden);
      activeSyncAbortRef.current?.abort();
      activeSyncAbortRef.current = null;
      sessionRef.current = null;
      synchronizerRef.current = null;
      unlockedWithAuthenticationRef.current = false;
    };
  }, [lock]);

  const selectPartition = useCallback((partitionHash: string) => {
    setState((current) => {
      if (!current.knownPartitions.includes(partitionHash)) return current;
      return { ...current, selectedPartition: partitionHash, error: null };
    });
  }, []);

  const provisionCaptureContext = useCallback(
    async (context: VoterCaptureContext) => {
      const session = sessionRef.current;
      if (!session) {
        throw new OfflineVaultError(
          "Desbloquea la bóveda antes de provisionar el contexto territorial.",
        );
      }
      const persistenceRequest = requestOfflineVaultStoragePersistence();
      try {
        await provisionOfflineCaptureContext(session, context);
        const storagePersistence = await persistenceRequest;
        await refreshUnlocked(
          session,
          "Contexto territorial y aviso guardados cifrados.",
        );
        setState((current) => ({ ...current, storagePersistence }));
      } catch (error) {
        closeForSecurityError(error);
        throw error;
      }
    },
    [closeForSecurityError, refreshUnlocked],
  );

  const enqueueVoter = useCallback(
    async (input: CreateVoterInput, capturedAt?: string) => {
      const session = sessionRef.current;
      if (!session) {
        throw new OfflineVaultError(
          "Desbloquea la bóveda antes de guardar una captura offline.",
        );
      }
      try {
        const id = await enqueueOfflineVoter(session, input, capturedAt);
        await refreshUnlocked(
          session,
          "Captura cifrada en este dispositivo; todavía no fue recibida por el servidor.",
        );
        return id;
      } catch (error) {
        closeForSecurityError(error);
        throw error;
      }
    },
    [closeForSecurityError, refreshUnlocked],
  );

  const provisionE14 = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !currentIdentity || !isOnline) {
      throw new OfflineVaultError(
        "Conectate y desbloquea la boveda con la identidad vigente para provisionar E-14.",
      );
    }
    if (document.visibilityState !== "visible") {
      throw new OfflineQueueForegroundRequiredError();
    }
    const persistenceRequest = requestOfflineVaultStoragePersistence();
    const currentEntries = await listOfflineQueue(session);
    if (currentEntries.some((entry) => entry.type === "E14_REPORT")) {
      throw new OfflineVaultError(
        "Sincroniza o elimina las actas E-14 locales antes de reemplazar su capacidad.",
      );
    }
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const grant = await requestOfflineE14Grant();
      await provisionOfflineE14Grant(session, grant);
      const storagePersistence = await persistenceRequest;
      await refreshUnlocked(
        session,
        `Capacidad E-14 ${grant.captureContext === "SIMULATION" ? "SIMULACRO" : "REAL"} guardada cifrada hasta ${new Date(grant.expiresAt).toLocaleString("es-CO")}.`,
      );
      setState((current) => ({ ...current, storagePersistence }));
    } catch (error) {
      if (!closeForSecurityError(error)) {
        setState((current) => ({
          ...current,
          busy: false,
          error: readableVaultError(error),
        }));
      }
      throw error;
    }
  }, [closeForSecurityError, currentIdentity, isOnline, refreshUnlocked]);

  const revokeE14 = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !currentIdentity || !isOnline) {
      throw new OfflineVaultError(
        "Conectate y desbloquea la boveda para revocar la capacidad E-14.",
      );
    }
    if (
      (await listOfflineQueue(session)).some(
        (entry) => entry.type === "E14_REPORT",
      )
    ) {
      throw new OfflineVaultError(
        "No se revoca mientras existan actas locales; sincronizalas o eliminalas primero.",
      );
    }
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      await revokeOfflineE14Grants();
      await clearOfflineE14Grant(session);
      await refreshUnlocked(
        session,
        "Capacidad E-14 revocada y retirada de esta boveda.",
      );
    } catch (error) {
      setState((current) => ({
        ...current,
        busy: false,
        error: readableVaultError(error),
      }));
      throw error;
    }
  }, [currentIdentity, isOnline, refreshUnlocked]);

  const enqueueE14 = useCallback(
    async (input: OfflineE14ReportInput, file: File, capturedAt?: string) => {
      const session = sessionRef.current;
      if (!session) {
        throw new OfflineVaultError(
          "Desbloquea la boveda antes de guardar un E-14 offline.",
        );
      }
      try {
        const id = await enqueueOfflineE14(session, input, file, capturedAt);
        await refreshUnlocked(
          session,
          "E-14 y archivo cifrados localmente; el servidor aun no los ha recibido.",
        );
        return id;
      } catch (error) {
        closeForSecurityError(error);
        throw error;
      }
    },
    [closeForSecurityError, refreshUnlocked],
  );

  const provisionIncidents = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !currentIdentity || !isOnline) {
      throw new OfflineVaultError(
        "Conectate y desbloquea la boveda con la identidad vigente para provisionar incidentes.",
      );
    }
    if (identityKey(session.identity) !== currentIdentityKey) {
      throw new OfflineQueueAuthorizationError();
    }
    const persistenceRequest = requestOfflineVaultStoragePersistence();
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const context = await getOfflineIncidentCaptureContext();
      await provisionOfflineIncidentContext(session, context);
      const storagePersistence = await persistenceRequest;
      await refreshUnlocked(
        session,
        "Rol y alcance territorial para incidentes guardados cifrados.",
      );
      setState((current) => ({ ...current, storagePersistence }));
    } catch (error) {
      if (!closeForSecurityError(error)) {
        setState((current) => ({
          ...current,
          busy: false,
          error: readableVaultError(error),
        }));
      }
      throw error;
    }
  }, [
    closeForSecurityError,
    currentIdentity,
    currentIdentityKey,
    isOnline,
    refreshUnlocked,
  ]);

  const enqueueIncident = useCallback(
    async (input: OfflineIncidentInput, capturedAt?: string) => {
      const session = sessionRef.current;
      if (!session) {
        throw new OfflineVaultError(
          "Desbloquea la boveda antes de guardar un incidente offline.",
        );
      }
      try {
        const id = await enqueueOfflineIncident(session, input, capturedAt);
        await refreshUnlocked(
          session,
          "Incidente cifrado en este dispositivo; aun no fue recibido por el servidor.",
        );
        return id;
      } catch (error) {
        closeForSecurityError(error);
        throw error;
      }
    },
    [closeForSecurityError, refreshUnlocked],
  );

  const provisionCalendarSnapshot = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !currentIdentity || !isOnline) {
      throw new OfflineVaultError(
        "Conectate y desbloquea la boveda para guardar el calendario activo.",
      );
    }
    if (identityKey(session.identity) !== currentIdentityKey) {
      throw new OfflineQueueAuthorizationError();
    }
    const persistenceRequest = requestOfflineVaultStoragePersistence();
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const overview = await getElectoralCalendarOverview();
      const active = overview.releases.find(
        (release) => release.status === "ACTIVE",
      );
      if (
        !active ||
        active.id !== overview.activeSummary.activeReleaseId ||
        active.milestones.length === 0
      ) {
        throw new OfflineVaultError(
          "No existe un calendario ACTIVE verificable para guardar.",
        );
      }
      const savedAt = new Date().toISOString();
      await saveOfflineCalendarSnapshot(session, {
        schemaVersion: 1,
        readOnly: true,
        releaseId: active.id,
        versionLabel: active.versionLabel,
        roundCode: active.roundCode,
        sourceSha256: active.sourceSha256,
        sourceCutoffAt: active.sourceCutoffAt,
        timeZone: active.milestones[0].timeZone,
        savedAt,
        milestones: active.milestones.map((milestone) => ({
          id: milestone.id,
          stableKey: milestone.stableKey,
          title: milestone.title,
          category: milestone.category,
          semantics: milestone.semantics,
          localDate: milestone.localDate,
          localTime: milestone.localTime,
          timeZone: milestone.timeZone,
          responsibleName: milestone.responsible?.name ?? null,
          backupName: milestone.backup?.name ?? null,
        })),
      });
      const storagePersistence = await persistenceRequest;
      await refreshUnlocked(
        session,
        `Calendario ACTIVE ${active.versionLabel} guardado como copia cifrada de solo lectura.`,
      );
      setState((current) => ({ ...current, storagePersistence }));
    } catch (error) {
      if (!closeForSecurityError(error)) {
        setState((current) => ({
          ...current,
          busy: false,
          error: readableVaultError(error),
        }));
      }
      throw error;
    }
  }, [
    closeForSecurityError,
    currentIdentity,
    currentIdentityKey,
    isOnline,
    refreshUnlocked,
  ]);

  const requireCurrentHeatmapSession = useCallback(() => {
    const session = sessionRef.current;
    if (
      !session ||
      currentIdentityKey === null ||
      identityKey(session.identity) !== currentIdentityKey
    ) {
      throw new OfflineQueueAuthorizationError();
    }
    return session;
  }, [currentIdentityKey]);

  const saveHeatmapSnapshot = useCallback(
    async (
      query: TerritoryHeatmapQuery,
      response: TerritoryHeatmapResponse,
    ) => {
      const session = requireCurrentHeatmapSession();
      const persistenceRequest = requestOfflineVaultStoragePersistence();
      try {
        const snapshot = await saveOfflineHeatmapSnapshot(
          session,
          query,
          response,
        );
        const storagePersistence = await persistenceRequest;
        await refreshUnlocked(
          session,
          "Vista territorial agregada guardada cifrada en este dispositivo.",
        );
        setState((current) => ({ ...current, storagePersistence }));
        return snapshot;
      } catch (error) {
        closeForSecurityError(error);
        throw error;
      }
    },
    [closeForSecurityError, refreshUnlocked, requireCurrentHeatmapSession],
  );

  const readHeatmapSnapshot = useCallback(
    async (query: TerritoryHeatmapQuery) => {
      const session = requireCurrentHeatmapSession();
      try {
        return await readOfflineHeatmapSnapshot(session, query);
      } catch (error) {
        closeForSecurityError(error);
        throw error;
      }
    },
    [closeForSecurityError, requireCurrentHeatmapSession],
  );

  const synchronize = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) throw new OfflineVaultError("La bóveda está bloqueada.");
    if (!navigator.onLine) {
      throw new OfflineVaultError(
        "No hay conexión. La sincronización solo se ejecuta en primer plano.",
      );
    }
    if (document.visibilityState !== "visible") {
      throw new OfflineQueueForegroundRequiredError();
    }
    const synchronizer =
      synchronizerRef.current ?? new OfflineQueueSynchronizer();
    synchronizerRef.current = synchronizer;
    const abortController = new AbortController();
    activeSyncAbortRef.current?.abort();
    activeSyncAbortRef.current = abortController;
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const result = await synchronizer.synchronize(session, {
        revalidateIdentity: async () => {
          let authenticated;
          try {
            authenticated = await getCurrentAuthUser(abortController.signal);
          } catch (error) {
            if (abortController.signal.aborted) {
              throw new OfflineQueueForegroundRequiredError();
            }
            throw error;
          }
          return {
            tenantId: authenticated.tenant.id,
            userId: authenticated.id,
          };
        },
        sendVoter: async (input) => {
          if (
            abortController.signal.aborted ||
            document.visibilityState !== "visible" ||
            sessionRef.current !== session
          ) {
            throw new OfflineQueueForegroundRequiredError();
          }
          try {
            return await syncOfflineVoter(input, abortController.signal);
          } catch (error) {
            if (abortController.signal.aborted) {
              throw new OfflineQueueForegroundRequiredError();
            }
            throw error;
          }
        },
        ensureForeground: () => {
          if (
            abortController.signal.aborted ||
            document.visibilityState !== "visible" ||
            sessionRef.current !== session
          ) {
            throw new OfflineQueueForegroundRequiredError();
          }
        },
        authorizeE14: (file, sha256) =>
          authorizeOfflineE14Evidence(file, sha256, abortController.signal),
        uploadE14: (file, authorization) =>
          uploadOfflineE14Evidence(file, authorization),
        confirmE14: (path, metadata) =>
          confirmOfflineE14Evidence(path, metadata, abortController.signal),
        sendE14: (input) => syncOfflineE14(input, abortController.signal),
        sendIncident: (input) =>
          syncOfflineIncident(input, abortController.signal),
      });
      await refreshUnlocked(
        session,
        result.applied > 0
          ? `${result.applied} operación(es) recibida(s) por el servidor.`
          : "No había operaciones elegibles para sincronizar ahora.",
      );
      return result;
    } catch (error) {
      if (!closeForSecurityError(error)) {
        setState((current) => ({
          ...current,
          busy: false,
          error: readableVaultError(error),
        }));
      }
      throw error;
    } finally {
      if (activeSyncAbortRef.current === abortController) {
        activeSyncAbortRef.current = null;
      }
    }
  }, [closeForSecurityError, refreshUnlocked]);

  const retry = useCallback(
    async (id: string) => {
      const session = sessionRef.current;
      if (!session) throw new OfflineVaultError("La bóveda está bloqueada.");
      try {
        await retryFailedOfflineQueueRecord(session, id);
        await refreshUnlocked(
          session,
          "La operación quedó lista para reintento manual.",
        );
      } catch (error) {
        closeForSecurityError(error);
        throw error;
      }
    },
    [closeForSecurityError, refreshUnlocked],
  );

  const remove = useCallback(
    async (id: string) => {
      const session = sessionRef.current;
      if (!session) throw new OfflineVaultError("La bóveda está bloqueada.");
      try {
        await deleteOfflineQueueRecord(session, id);
        await refreshUnlocked(
          session,
          "Operación eliminada de este dispositivo.",
        );
      } catch (error) {
        closeForSecurityError(error);
        throw error;
      }
    },
    [closeForSecurityError, refreshUnlocked],
  );

  const sessionMatchesCurrentIdentity =
    state.unlockedIdentityKey !== null &&
    (currentIdentityKey !== null
      ? state.unlockedIdentityKey === currentIdentityKey
      : !state.unlockedWithAuthenticatedIdentity);
  const safelyUnlocked =
    state.phase === "UNLOCKED" && sessionMatchesCurrentIdentity;

  const value = useMemo<OfflineVaultContextValue>(
    () => ({
      phase:
        state.phase === "UNLOCKED" && !safelyUnlocked ? "LOCKED" : state.phase,
      isOnline,
      busy: state.busy,
      message: state.message,
      error: state.error,
      knownPartitions: state.knownPartitions,
      selectedPartition: state.selectedPartition,
      entries: safelyUnlocked ? state.entries : [],
      captureContext: safelyUnlocked ? state.captureContext : null,
      e14Grant: safelyUnlocked ? state.e14Grant : null,
      incidentContext: safelyUnlocked ? state.incidentContext : null,
      electoralCalendarSnapshot: safelyUnlocked
        ? state.electoralCalendarSnapshot
        : null,
      heatmapSnapshots: safelyUnlocked ? state.heatmapSnapshots : [],
      storagePersistence: safelyUnlocked ? state.storagePersistence : "UNKNOWN",
      createVault,
      unlock,
      lock,
      selectPartition,
      provisionCaptureContext,
      saveHeatmapSnapshot,
      readHeatmapSnapshot,
      enqueueVoter,
      provisionE14,
      revokeE14,
      enqueueE14,
      provisionIncidents,
      enqueueIncident,
      provisionCalendarSnapshot,
      synchronize,
      retry,
      remove,
    }),
    [
      createVault,
      enqueueVoter,
      enqueueE14,
      enqueueIncident,
      isOnline,
      lock,
      provisionCaptureContext,
      provisionCalendarSnapshot,
      provisionE14,
      provisionIncidents,
      readHeatmapSnapshot,
      remove,
      retry,
      safelyUnlocked,
      selectPartition,
      saveHeatmapSnapshot,
      state,
      synchronize,
      unlock,
      revokeE14,
    ],
  );

  return (
    <OfflineVaultContext.Provider value={value}>
      {children}
    </OfflineVaultContext.Provider>
  );
}

export function useOfflineVault(): OfflineVaultContextValue {
  const value = useContext(OfflineVaultContext);
  if (!value) {
    throw new Error("useOfflineVault requiere OfflineVaultProvider");
  }
  return value;
}
