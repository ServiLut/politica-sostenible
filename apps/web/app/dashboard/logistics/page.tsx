"use client";

import { usePageRequest } from "@/lib/use-page-request";
import { isOperationProfileRequired } from "@/lib/operation-profile-required";
import { OperationProfileRequired } from "@/components/operation-profile/OperationProfileRequired";

import { useAuth } from "@/context/auth";
import { useConfirmation } from "@/context/confirmation";
import { ApiError } from "@/lib/api-client";
import type { VotingPlace } from "@/lib/election-api";
import { InventoryVotingPlaceSelect } from "@/components/logistics/InventoryVotingPlaceSelect";
import { createInventoryMutationState } from "@/lib/inventory-mutation-state";
import {
  createInventoryWarehouse,
  dispatchInventory,
  getInventoryOverview,
  importInventoryItems,
  receiveInventoryStock,
  receiveInventoryTransfer,
  reconcileInventoryTransfer,
  reportInventoryIncident,
  returnInventoryTransfer,
  type InventoryCommandResponse,
  type InventoryIncidentType,
  type InventoryTrackingMode,
  type InventoryStockCondition,
  type InventoryTransfer,
} from "@/lib/inventory-logistics-api";
import type {
  BackendUserRole,
  PoliticalOperationStage,
} from "@/types/saas-schema";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

const ADMIN_ROLES = new Set<BackendUserRole>(["ADMIN", "CAMPAIGN_MANAGER"]);
const FIELD_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "ZONE_COORDINATOR",
]);
const SETUP_STAGES = new Set<PoliticalOperationStage>([
  "EXPLORATION",
  "PRE_CAMPAIGN",
  "SIGNATURE_COLLECTION",
  "CAMPAIGN",
  "ELECTION_PREPARATION",
  "SIMULATION",
]);
const STOCK_STAGES = new Set<PoliticalOperationStage>([
  ...SETUP_STAGES,
  "ELECTION_DAY",
]);
const DISPATCH_STAGES = new Set<PoliticalOperationStage>([
  "CAMPAIGN",
  "ELECTION_PREPARATION",
  "SIMULATION",
  "ELECTION_DAY",
]);
const RECEIVE_STAGES = new Set<PoliticalOperationStage>([
  ...DISPATCH_STAGES,
  "POST_ELECTION",
]);
const RETURN_STAGES = new Set<PoliticalOperationStage>([
  "SIMULATION",
  "ELECTION_DAY",
  "POST_ELECTION",
]);
const RECONCILE_STAGES = new Set<PoliticalOperationStage>([
  "SIMULATION",
  "POST_ELECTION",
]);

const STAGE_LABELS: Record<PoliticalOperationStage, string> = {
  EXPLORATION: "Exploración",
  PRE_CAMPAIGN: "Precandidatura",
  SIGNATURE_COLLECTION: "Recolección de firmas",
  CAMPAIGN: "Campaña",
  ELECTION_PREPARATION: "Preparación electoral",
  SIMULATION: "Simulacro",
  ELECTION_DAY: "Jornada electoral",
  POST_ELECTION: "Poselección",
  CLOSED: "Cierre",
};

const CONDITION_LABELS: Record<InventoryStockCondition, string> = {
  AVAILABLE: "Disponible",
  QUARANTINED: "En cuarentena",
  DAMAGED: "Dañado",
  EXPIRED: "Vencido",
};

const STATUS_LABELS: Record<InventoryTransfer["status"], string> = {
  DISPATCHED: "Despachado",
  PARTIALLY_RECEIVED: "Recepción parcial",
  RECEIVED: "Recibido",
  RECEIVED_WITH_INCIDENT: "Recibido con novedad",
  PARTIALLY_RETURNED: "Devolución parcial",
  RETURNED: "Devuelto",
  RECONCILED: "Conciliado",
};

const INCIDENT_OPTIONS: Array<{ value: InventoryIncidentType; label: string }> =
  [
    { value: "MISSING", label: "Faltante" },
    { value: "DAMAGED", label: "Daño" },
    { value: "EXPIRED", label: "Vencimiento" },
    { value: "CUSTODY_BREACH", label: "Ruptura de custodia" },
    { value: "OTHER", label: "Otra novedad" },
  ];

function readableError(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      error.message ===
      "Un articulo por lote exige lotNumber y no admite serialNumber"
    ) {
      return "Indica el número de lote de este artículo y deja el campo serial vacío.";
    }
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error inesperado. Recarga los datos y vuelve a intentar.";
}

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Fecha inválida";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function requiredText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(data: FormData, key: string): string | undefined {
  return requiredText(data, key) || undefined;
}

function integerField(data: FormData, key: string): number {
  const parsed = Number(requiredText(data, key));
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function isoFromLocal(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

function freshCommandId(): string {
  return globalThis.crypto.randomUUID();
}

function commandNotice(
  label: string,
  result: InventoryCommandResponse<object>,
): string {
  return result.noOp
    ? `${label}: este movimiento ya estaba registrado y no se duplicó.`
    : `${label}: confirmado con recibo ${result.command.id}.`;
}

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold ${warning && value > 0 ? "text-amber-700" : "text-slate-950"}`}
      >
        {value.toLocaleString("es-CO")}
      </p>
    </div>
  );
}

export default function LogisticsPage() {
  const { user, tenant } = useAuth();
  return <LogisticsPanel key={`${tenant?.id ?? ""}/${user?.id ?? ""}`} />;
}

function LogisticsPanel() {
  const confirm = useConfirmation();
  const { user, tenant } = useAuth();
  const mutationOwner = `${tenant?.id ?? ""}/${user?.id ?? ""}`;
  const mutationQueue = useMemo(
    () => createInventoryMutationState(mutationOwner),
    [mutationOwner],
  );
  const mutation = useSyncExternalStore(
    mutationQueue.subscribe,
    mutationQueue.getSnapshot,
    mutationQueue.getServerSnapshot,
  );
  const mutationKey = mutation.key;
  const mutationError = mutation.error ? readableError(mutation.error) : null;
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<VotingPlace | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [dispatchDestination, setDispatchDestination] = useState<
    "WAREHOUSE" | "POLLING_PLACE"
  >("POLLING_PLACE");

  const request = useCallback(async (signal: AbortSignal) => {
    return getInventoryOverview(signal);
  }, []);
  const {
    data,
    loading,
    error: requestError,
    refresh: load,
  } = usePageRequest(request, {
    reloadKey: reloadVersion,
    retainDataOnRefresh: true,
  });
  const overview = data;
  const loadError = requestError ? readableError(requestError) : null;

  const role = user?.backendRole;
  const canAdmin = Boolean(role && ADMIN_ROLES.has(role));
  const canField = Boolean(role && FIELD_ROLES.has(role));
  const stage = overview?.operation.stage;
  const availableBalances = useMemo(
    () =>
      overview?.balances.filter(
        (balance) => balance.quantity > 0 && balance.condition === "AVAILABLE",
      ) ?? [],
    [overview?.balances],
  );

  useEffect(() => {
    mutationQueue.activate();
    return mutationQueue.deactivate;
  }, [mutationQueue]);

  useEffect(() => {
    if (!mutation.key) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [mutation.key]);

  function runMutation<
    Input extends { clientRequestId: string },
    Result extends object,
  >(
    key: string,
    label: string,
    prepare: () => Input,
    send: (input: Input) => Promise<InventoryCommandResponse<Result>>,
    form?: HTMLFormElement,
  ) {
    const accepted = mutationQueue.start(
      key,
      label,
      prepare,
      send,
      (result) => {
        setNotice(commandNotice(label, result));
        if (form?.isConnected) form.reset();
        if (key === "dispatch") setSelectedPlace(null);
        void load();
      },
    );
    if (accepted) setNotice(null);
  }

  function submitWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void runMutation(
      "warehouse",
      "Bodega creada",
      () => ({
        clientRequestId: freshCommandId(),
        code: requiredText(data, "code"),
        name: requiredText(data, "name"),
        address: optionalText(data, "address"),
        responsibleUserId: optionalText(data, "responsibleUserId"),
      }),
      createInventoryWarehouse,
      form,
    );
  }

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void runMutation(
      "item",
      "Artículo importado",
      () => ({
        clientRequestId: freshCommandId(),
        items: [
          {
            sku: requiredText(data, "sku"),
            name: requiredText(data, "name"),
            description: optionalText(data, "description"),
            unit: requiredText(data, "unit"),
            trackingMode: requiredText(
              data,
              "trackingMode",
            ) as InventoryTrackingMode,
            minimumStock: integerField(data, "minimumStock"),
          },
        ],
      }),
      importInventoryItems,
      form,
    );
  }

  function submitStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void runMutation(
      "stock",
      "Ingreso de existencias",
      () => ({
        clientRequestId: freshCommandId(),
        warehouseId: requiredText(data, "warehouseId"),
        itemId: requiredText(data, "itemId"),
        quantity: integerField(data, "quantity"),
        lotNumber: optionalText(data, "lotNumber"),
        serialNumber: optionalText(data, "serialNumber"),
        expiresAt: isoFromLocal(optionalText(data, "expiresAt")),
        responsibleUserId: optionalText(data, "responsibleUserId"),
        reason: requiredText(data, "reason"),
        custodyDeclaration: requiredText(data, "custodyDeclaration"),
        occurredAt: new Date().toISOString(),
      }),
      receiveInventoryStock,
      form,
    );
  }

  function submitDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lines = availableBalances
      .filter((balance) => data.get(`selected-${balance.id}`) === "on")
      .map((balance) => ({
        stockBalanceId: balance.id,
        quantity: integerField(data, `quantity-${balance.id}`),
      }));
    const destinationId = requiredText(data, "destinationId");
    const warehouse = overview?.warehouses.find(
      (candidate) => candidate.id === destinationId,
    );
    const place = selectedPlace?.id === destinationId ? selectedPlace : null;
    void runMutation(
      "dispatch",
      "Despacho confirmado",
      () => ({
        clientRequestId: freshCommandId(),
        code: requiredText(data, "code"),
        sourceWarehouseId: requiredText(data, "sourceWarehouseId"),
        ...(dispatchDestination === "WAREHOUSE"
          ? { destinationWarehouseId: destinationId }
          : { destinationDivisionId: destinationId }),
        destinationLabel:
          dispatchDestination === "WAREHOUSE"
            ? `${warehouse?.code ?? "BODEGA"} · ${warehouse?.name ?? "Destino seleccionado"}`
            : `${place?.code ?? "PUESTO"} · ${place?.name ?? "Destino seleccionado"}`,
        ...(dispatchDestination === "POLLING_PLACE" &&
        optionalText(data, "destinationTableNumber")
          ? {
              destinationTableNumber: integerField(
                data,
                "destinationTableNumber",
              ),
            }
          : {}),
        custodianUserId: requiredText(data, "custodianUserId"),
        purpose: requiredText(data, "purpose"),
        custodyDeclaration: requiredText(data, "custodyDeclaration"),
        occurredAt: new Date().toISOString(),
        expectedReturnAt: isoFromLocal(optionalText(data, "expectedReturnAt")),
        lines,
      }),
      dispatchInventory,
      form,
    );
  }

  function submitReceive(
    event: FormEvent<HTMLFormElement>,
    transfer: InventoryTransfer,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lines = transfer.lines
      .map((line) => ({
        lineId: line.id,
        usableQuantity: integerField(data, `usable-${line.id}`),
        damagedQuantity: integerField(data, `damaged-${line.id}`),
        missingQuantity: integerField(data, `missing-${line.id}`),
      }))
      .filter(
        (line) =>
          line.usableQuantity + line.damagedQuantity + line.missingQuantity > 0,
      );
    void runMutation(
      `receive-${transfer.id}`,
      "Recepción confirmada",
      () => ({
        clientRequestId: freshCommandId(),
        expectedTransferUpdatedAt: transfer.updatedAt,
        custodyDeclaration: requiredText(data, "custodyDeclaration"),
        occurredAt: new Date().toISOString(),
        lines,
      }),
      (input) => receiveInventoryTransfer(transfer.id, input),
      form,
    );
  }

  function submitReturn(
    event: FormEvent<HTMLFormElement>,
    transfer: InventoryTransfer,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lines = transfer.lines
      .map((line) => ({
        lineId: line.id,
        quantity: integerField(data, `return-${line.id}`),
      }))
      .filter((line) => line.quantity > 0);
    void runMutation(
      `return-${transfer.id}`,
      "Devolución confirmada",
      () => ({
        clientRequestId: freshCommandId(),
        expectedTransferUpdatedAt: transfer.updatedAt,
        custodyDeclaration: requiredText(data, "custodyDeclaration"),
        occurredAt: new Date().toISOString(),
        lines,
      }),
      (input) => returnInventoryTransfer(transfer.id, input),
      form,
    );
  }

  async function submitReconcile(
    event: FormEvent<HTMLFormElement>,
    transfer: InventoryTransfer,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (
      !(await confirm({
        title: "Conciliar despacho definitivamente",
        description: `El despacho ${transfer.code} quedará conciliado y esta decisión no se podrá editar ni revertir.`,
        confirmLabel: "Confirmar conciliación",
        destructive: true,
      }))
    ) {
      return;
    }
    void runMutation(
      `reconcile-${transfer.id}`,
      "Conciliación definitiva",
      () => ({
        clientRequestId: freshCommandId(),
        expectedTransferUpdatedAt: transfer.updatedAt,
        reconciliationNote: requiredText(data, "reconciliationNote"),
        occurredAt: new Date().toISOString(),
        lines: transfer.lines.map((line) => ({
          lineId: line.id,
          consumedQuantity: integerField(data, `consumed-${line.id}`),
          missingQuantity: integerField(data, `missing-${line.id}`),
          damagedQuantity: integerField(data, `damaged-${line.id}`),
        })),
      }),
      (input) => reconcileInventoryTransfer(transfer.id, input),
      form,
    );
  }

  function submitIncident(
    event: FormEvent<HTMLFormElement>,
    transfer: InventoryTransfer,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const quantity = optionalText(data, "quantity");
    void runMutation(
      `incident-${transfer.id}`,
      "Incidencia registrada",
      () => ({
        clientRequestId: freshCommandId(),
        expectedTransferUpdatedAt: transfer.updatedAt,
        lineId: optionalText(data, "lineId"),
        type: requiredText(data, "type") as InventoryIncidentType,
        ...(quantity ? { quantity: Number(quantity) } : {}),
        description: requiredText(data, "description"),
        evidenceReference: optionalText(data, "evidenceReference"),
        evidenceSha256: optionalText(data, "evidenceSha256"),
        occurredAt: new Date().toISOString(),
      }),
      (input) => reportInventoryIncident(transfer.id, input),
      form,
    );
  }

  if (loading && !overview) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center min-w-0"
        aria-busy="true"
      >
        <Loader2 className="animate-spin text-blue-600" aria-hidden="true" />
        <span className="ml-3 font-semibold text-slate-700">
          Cargando inventario y custodias…
        </span>
      </div>
    );
  }

  if (!overview && isOperationProfileRequired(requestError)) {
    return (
      <OperationProfileRequired
        title="Logística electoral"
        description="El perfil permite organizar bodegas, entregas y responsables según la etapa de la campaña. Revísalo para empezar a gestionar el inventario."
      />
    );
  }

  if (loadError && !overview) {
    return (
      <div
        className="mx-auto max-w-3xl min-w-0"
        data-testid="inventory-load-error"
      >
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-5 min-w-0"
        >
          <h1 className="font-semibold text-red-950 text-2xl sm:text-3xl break-words">
            No se pudo abrir logística
          </h1>
          <p className="mt-2 text-sm text-red-800">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadVersion((version) => version + 1)}
            className="mt-4 min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white max-w-full whitespace-normal"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!overview || !stage) return null;

  return (
    <div
      className="mx-auto max-w-7xl space-y-6 pb-24 min-w-0"
      data-testid="inventory-page"
    >
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between min-w-0">
        <div>
          <p className="text-xs font-bold text-blue-700">
            Operación electoral · {STAGE_LABELS[stage]}
          </p>
          <h1 className="mt-1 font-semibold tracking-tight text-slate-950 text-2xl sm:text-3xl break-words">
            Inventario, despacho y custodia
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Saldos por bodega, lotes y seriales, entrega a puesto o mesa,
            recepción, devolución, incidencias y conciliación con rastro
            inmutable.
          </p>
        </div>
        <button
          type="button"
          data-testid="inventory-refresh"
          disabled={loading}
          onClick={() => setReloadVersion((version) => version + 1)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-50 max-w-full whitespace-normal"
        >
          <RefreshCw
            className={loading ? "animate-spin" : ""}
            size={17}
            aria-hidden="true"
          />
          Recargar saldos
        </button>
      </header>

      {loadError ? (
        <div
          role="alert"
          className="min-w-0 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p>
            Se muestran los últimos saldos consultados. No se pudo
            actualizarlos: {loadError}
          </p>
          <p className="mt-1">
            Los recibos de movimientos ya confirmados se conservan; esta
            consulta no vuelve a registrar movimientos.
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={() => setReloadVersion((version) => version + 1)}
            className="mt-2 min-h-11 rounded-xl border border-amber-500 px-3 font-semibold disabled:opacity-50"
          >
            Reintentar consulta de saldos
          </button>
        </div>
      ) : null}

      {overview.readOnly ? (
        <section
          role="status"
          className="rounded-2xl border border-slate-300 bg-slate-100 p-4 min-w-0"
        >
          <div className="flex gap-3 min-w-0">
            <ShieldCheck
              className="mt-0.5 shrink-0 text-slate-700"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-semibold text-slate-950">
                Expediente en solo lectura
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                La operación está cerrada
                {overview.operation.closureType === "CLOSED_EXCEPTIONAL"
                  ? " excepcionalmente"
                  : ""}
                . Se conserva la trazabilidad, pero toda mutación está bloqueada
                también dentro de la transacción.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {overview.warnings.map((warning) => (
        <div
          key={warning}
          role="alert"
          className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 min-w-0"
        >
          <AlertTriangle className="shrink-0" size={20} aria-hidden="true" />
          <p>{warning}</p>
        </div>
      ))}
      {mutation.phase !== "idle" ? (
        <div
          role={mutation.phase === "uncertain" ? "alert" : "status"}
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 min-w-0"
        >
          <p className="font-semibold">
            {mutation.phase === "uncertain"
              ? "El resultado aún no está confirmado"
              : "Esperando el recibo del movimiento"}
          </p>
          <p>
            {mutation.label}. Las nuevas órdenes están bloqueadas hasta aclarar
            esta operación. El reintento conserva el contenido original aunque
            hayas editado los campos.
          </p>
          <p className="mt-2">
            No cierres, recargues ni salgas de esta página: el reintento se
            conserva sólo en memoria. Si sales, revisa los recibos y saldos
            antes de repetir un movimiento; esta pantalla no recupera órdenes
            pendientes después de navegar o recargar.
          </p>
          {mutation.phase === "uncertain" ? (
            <button
              type="button"
              onClick={() => void mutationQueue.retry()}
              className="mt-3 min-h-11 rounded-xl border border-amber-600 px-4 font-semibold"
            >
              Reintentar la misma operación
            </button>
          ) : null}
        </div>
      ) : null}
      {mutationError ? (
        <div
          role="alert"
          data-testid="inventory-mutation-error"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-900 min-w-0"
        >
          {mutationError}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          data-testid="inventory-mutation-success"
          className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 min-w-0"
        >
          <CheckCircle2 size={19} aria-hidden="true" /> {notice}
        </div>
      ) : null}

      <section
        aria-label="Resumen de inventario"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 min-w-0"
      >
        <SummaryCard
          label="Unidades disponibles"
          value={overview.summary.availableUnits}
        />
        <SummaryCard
          label="Despachos activos"
          value={overview.summary.activeTransferCount}
          warning
        />
        <SummaryCard
          label="Artículos bajo mínimo"
          value={overview.summary.lowStockItemCount}
          warning
        />
        <SummaryCard
          label="Saldos vencidos"
          value={overview.summary.expiredBalanceCount}
          warning
        />
      </section>

      {canAdmin && !overview.readOnly ? (
        <section
          aria-labelledby="inventory-actions-title"
          className="rounded-3xl border border-slate-200 bg-slate-50 p-4 md:p-6 min-w-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Boxes className="text-blue-700" aria-hidden="true" />
            <div>
              <h2
                id="inventory-actions-title"
                className="text-xl font-semibold text-slate-950"
              >
                Preparar y despachar
              </h2>
              <p className="text-sm text-slate-600">
                Espera la confirmación de cada movimiento antes de continuar.
                Después podrás comprobar su recibo y el saldo actualizado.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2 min-w-0">
            {SETUP_STAGES.has(stage) ? (
              <details className="rounded-2xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer font-semibold text-slate-900">
                  Nueva bodega responsable
                </summary>
                <form
                  data-testid="create-warehouse-form"
                  onSubmit={submitWarehouse}
                  className="mt-4 grid gap-3 min-w-0"
                >
                  <label className="text-sm font-semibold min-w-0">
                    Código
                    <input
                      required
                      name="code"
                      minLength={2}
                      maxLength={32}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Nombre
                    <input
                      required
                      name="name"
                      minLength={3}
                      maxLength={160}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Dirección verificada (opcional)
                    <input
                      name="address"
                      maxLength={500}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Responsable
                    <select
                      name="responsibleUserId"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    >
                      <option value="">Sin asignar todavía</option>
                      {overview.operators.map((operator) => (
                        <option key={operator.id} value={operator.id}>
                          {operator.name} · {operator.role}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={Boolean(mutationKey)}
                    className="min-h-11 rounded-xl bg-blue-700 px-4 font-bold text-white disabled:opacity-50 max-w-full whitespace-normal"
                  >
                    {mutationKey === "warehouse"
                      ? "Guardando…"
                      : "Crear bodega"}
                  </button>
                </form>
              </details>
            ) : null}

            {SETUP_STAGES.has(stage) ? (
              <details className="rounded-2xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer font-semibold text-slate-900">
                  Crear artículo
                </summary>
                <form
                  data-testid="item-import-form"
                  onSubmit={submitItem}
                  className="mt-4 grid gap-3 sm:grid-cols-2 min-w-0"
                >
                  <label className="text-sm font-semibold min-w-0">
                    SKU
                    <input
                      required
                      name="sku"
                      minLength={2}
                      maxLength={64}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Nombre
                    <input
                      required
                      name="name"
                      minLength={2}
                      maxLength={160}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Unidad
                    <input
                      required
                      name="unit"
                      defaultValue="UNIDAD"
                      maxLength={40}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Trazabilidad
                    <select
                      name="trackingMode"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    >
                      <option value="NONE">Sin lote/serial</option>
                      <option value="LOT">Por lote</option>
                      <option value="SERIAL">Por serial</option>
                    </select>
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Stock mínimo
                    <input
                      required
                      type="number"
                      name="minimumStock"
                      min={0}
                      max={1000000}
                      defaultValue={0}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2 min-w-0">
                    Descripción (opcional)
                    <textarea
                      name="description"
                      maxLength={1000}
                      className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3 min-w-0 max-w-full"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={Boolean(mutationKey)}
                    className="min-h-11 rounded-xl bg-blue-700 px-4 font-bold text-white disabled:opacity-50 sm:col-span-2 max-w-full whitespace-normal"
                  >
                    {mutationKey === "item" ? "Guardando…" : "Guardar artículo"}
                  </button>
                </form>
              </details>
            ) : null}

            {STOCK_STAGES.has(stage) ? (
              <details className="rounded-2xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer font-semibold text-slate-900">
                  Ingresar existencias
                </summary>
                <form
                  data-testid="stock-receive-form"
                  onSubmit={submitStock}
                  className="mt-4 grid gap-3 sm:grid-cols-2 min-w-0"
                >
                  <label className="text-sm font-semibold min-w-0">
                    Bodega
                    <select
                      required
                      name="warehouseId"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    >
                      <option value="">Seleccione</option>
                      {overview.warehouses
                        .filter((warehouse) => warehouse.isActive)
                        .map((warehouse) => (
                          <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.code} · {warehouse.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Artículo
                    <select
                      required
                      name="itemId"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    >
                      <option value="">Seleccione</option>
                      {overview.items
                        .filter((item) => item.isActive)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.sku ?? "SIN-SKU"} · {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Cantidad
                    <input
                      required
                      type="number"
                      name="quantity"
                      min={1}
                      max={1000000}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Responsable
                    <select
                      name="responsibleUserId"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    >
                      <option value="">Responsable de bodega</option>
                      {overview.operators.map((operator) => (
                        <option key={operator.id} value={operator.id}>
                          {operator.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Lote (sólo artículos por lote)
                    <input
                      name="lotNumber"
                      maxLength={120}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Serial (sólo artículos serializados)
                    <input
                      name="serialNumber"
                      maxLength={160}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Vencimiento verificable
                    <input
                      type="datetime-local"
                      name="expiresAt"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2 min-w-0">
                    Motivo
                    <input
                      required
                      name="reason"
                      minLength={10}
                      maxLength={1000}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2 min-w-0">
                    Declaración de custodia
                    <textarea
                      required
                      name="custodyDeclaration"
                      minLength={20}
                      maxLength={1000}
                      className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3 min-w-0 max-w-full"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={Boolean(mutationKey)}
                    className="min-h-11 rounded-xl bg-blue-700 px-4 font-bold text-white disabled:opacity-50 sm:col-span-2 max-w-full whitespace-normal"
                  >
                    {mutationKey === "stock"
                      ? "Confirmando…"
                      : "Confirmar ingreso"}
                  </button>
                </form>
              </details>
            ) : null}

            {DISPATCH_STAGES.has(stage) ? (
              <details className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
                <summary className="cursor-pointer font-semibold text-slate-900">
                  Despachar kit o materiales
                </summary>
                <form
                  data-testid="dispatch-form"
                  onSubmit={submitDispatch}
                  className="mt-4 grid gap-4 min-w-0"
                >
                  <div className="grid gap-3 md:grid-cols-3 min-w-0">
                    <label className="text-sm font-semibold min-w-0">
                      Código de despacho
                      <input
                        required
                        name="code"
                        minLength={3}
                        maxLength={64}
                        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                      />
                    </label>
                    <label className="text-sm font-semibold min-w-0">
                      Bodega origen
                      <select
                        required
                        name="sourceWarehouseId"
                        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                      >
                        <option value="">Seleccione</option>
                        {overview.warehouses
                          .filter((warehouse) => warehouse.isActive)
                          .map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.code} · {warehouse.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="text-sm font-semibold min-w-0">
                      Custodio
                      <select
                        required
                        name="custodianUserId"
                        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                      >
                        <option value="">Seleccione</option>
                        {overview.operators.map((operator) => (
                          <option key={operator.id} value={operator.id}>
                            {operator.name} · {operator.role}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <fieldset className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-semibold">
                      Tipo de destino
                    </legend>
                    <div className="flex flex-wrap gap-4 min-w-0">
                      <label className="flex min-h-11 items-center gap-2 min-w-0">
                        <input
                          type="radio"
                          checked={dispatchDestination === "POLLING_PLACE"}
                          onChange={() =>
                            setDispatchDestination("POLLING_PLACE")
                          }
                        />
                        Puesto / mesa oficial
                      </label>
                      <label className="flex min-h-11 items-center gap-2 min-w-0">
                        <input
                          type="radio"
                          checked={dispatchDestination === "WAREHOUSE"}
                          onChange={() => setDispatchDestination("WAREHOUSE")}
                        />
                        Otra bodega
                      </label>
                    </div>
                  </fieldset>
                  {dispatchDestination === "POLLING_PLACE" ? (
                    <div className="grid gap-3 md:grid-cols-2 min-w-0">
                      <InventoryVotingPlaceSelect
                        value={selectedPlace}
                        onChange={setSelectedPlace}
                        disabled={Boolean(mutationKey)}
                      />
                      <label className="text-sm font-semibold min-w-0">
                        Mesa específica (opcional)
                        <input
                          type="number"
                          name="destinationTableNumber"
                          min={1}
                          max={10000}
                          className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="text-sm font-semibold min-w-0">
                      Bodega destino
                      <select
                        required
                        name="destinationId"
                        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                      >
                        <option value="">Seleccione</option>
                        {overview.warehouses
                          .filter((warehouse) => warehouse.isActive)
                          .map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.code} · {warehouse.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <fieldset className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-semibold">
                      Existencias del kit
                    </legend>
                    <div className="grid gap-2 min-w-0">
                      {availableBalances.length === 0 ? (
                        <p className="text-sm text-amber-800">
                          No hay saldos disponibles.
                        </p>
                      ) : (
                        availableBalances.map((balance) => (
                          <div
                            key={balance.id}
                            className="grid items-center gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[auto_minmax(0,1fr)_8rem] min-w-0"
                          >
                            <input
                              aria-label={`Incluir ${balance.item.name}`}
                              type="checkbox"
                              name={`selected-${balance.id}`}
                            />
                            <span className="text-sm">
                              <strong>{balance.item.name}</strong> ·{" "}
                              {balance.warehouse.code} · disponible{" "}
                              {balance.quantity}
                              {balance.lotNumber
                                ? ` · lote ${balance.lotNumber}`
                                : ""}
                              {balance.serialNumber
                                ? ` · serial ${balance.serialNumber}`
                                : ""}
                            </span>
                            <label className="text-sm font-semibold min-w-0">
                              Cantidad
                              <input
                                aria-label={`Cantidad ${balance.item.name}`}
                                type="number"
                                name={`quantity-${balance.id}`}
                                min={1}
                                max={balance.quantity}
                                defaultValue={1}
                                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 min-w-0 max-w-full"
                              />
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  </fieldset>
                  <label className="text-sm font-semibold min-w-0">
                    Propósito operativo
                    <textarea
                      required
                      name="purpose"
                      minLength={20}
                      maxLength={1000}
                      className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Declaración de entrega y custodia
                    <textarea
                      required
                      name="custodyDeclaration"
                      minLength={20}
                      maxLength={1000}
                      className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="text-sm font-semibold min-w-0">
                    Retorno esperado (opcional)
                    <input
                      type="datetime-local"
                      name="expectedReturnAt"
                      className="mt-1 min-h-11 rounded-xl border border-slate-300 px-3 min-w-0 max-w-full"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={
                      Boolean(mutationKey) || availableBalances.length === 0
                    }
                    className="min-h-11 rounded-xl bg-blue-700 px-4 font-bold text-white disabled:opacity-50 max-w-full whitespace-normal"
                  >
                    {mutationKey === "dispatch"
                      ? "Despachando…"
                      : "Confirmar despacho y abrir custodia"}
                  </button>
                </form>
              </details>
            ) : null}
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="stock-title"
        className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6 min-w-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Warehouse className="text-blue-700" aria-hidden="true" />
          <h2 id="stock-title" className="text-xl font-semibold">
            Existencias verificables
          </h2>
        </div>
        {overview.balances.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            Aún no hay saldos. Cree bodega, artículo y registre el ingreso
            físico.
          </p>
        ) : (
          <div
            className="mt-4 overflow-x-auto min-w-0 max-w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            role="region"
            aria-label="Inventario logístico: tabla con desplazamiento horizontal"
            tabIndex={0}
          >
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500">
                  <th className="p-2">Artículo</th>
                  <th className="p-2">Bodega</th>
                  <th className="p-2">Trazabilidad</th>
                  <th className="p-2">Condición</th>
                  <th className="p-2 text-right">Cantidad</th>
                  <th className="p-2">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {overview.balances.map((balance) => (
                  <tr key={balance.id} className="border-b border-slate-100">
                    <td className="p-2">
                      <strong>{balance.item.name}</strong>
                      <span className="block text-xs text-slate-500">
                        {balance.item.sku ?? "Legado sin SKU"}
                        {balance.item.recordOrigin === "LEGACY_UNCLASSIFIED"
                          ? " · origen no clasificado"
                          : ""}
                      </span>
                    </td>
                    <td className="p-2">
                      {balance.warehouse.code} · {balance.warehouse.name}
                    </td>
                    <td className="p-2">
                      {balance.serialNumber
                        ? `Serial ${balance.serialNumber}`
                        : balance.lotNumber
                          ? `Lote ${balance.lotNumber}`
                          : "Sin lote/serial"}
                      <span className="block text-xs text-slate-500">
                        {balance.expiresAt
                          ? `Vence ${formatDate(balance.expiresAt)}`
                          : "Sin vencimiento declarado"}
                      </span>
                    </td>
                    <td className="p-2">
                      {CONDITION_LABELS[balance.condition]}
                    </td>
                    <td className="p-2 text-right text-lg font-semibold">
                      {balance.quantity}
                    </td>
                    <td className="p-2">
                      {balance.responsibleUser?.name ?? "No asignado"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="transfers-title" className="space-y-4 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <Truck className="text-blue-700" aria-hidden="true" />
          <h2 id="transfers-title" className="text-xl font-semibold">
            Despachos y cadena de custodia
          </h2>
        </div>
        {overview.transfers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600 min-w-0">
            No hay despachos registrados.
          </div>
        ) : (
          overview.transfers.map((transfer) => (
            <article
              key={transfer.id}
              data-testid={`transfer-${transfer.id}`}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6 min-w-0"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between min-w-0">
                <div>
                  <p className="text-xs font-bold text-blue-700">
                    {transfer.code}
                  </p>
                  <h3 className="text-lg font-semibold text-slate-950">
                    {transfer.destinationLabel}
                    {transfer.destinationTableNumber
                      ? ` · Mesa ${transfer.destinationTableNumber}`
                      : ""}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Custodio: {transfer.custodian.name} · Salió{" "}
                    {formatDate(transfer.dispatchedAt)}
                  </p>
                </div>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                  {STATUS_LABELS[transfer.status]}
                </span>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 min-w-0">
                {transfer.lines.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-xl bg-slate-50 p-3 text-sm min-w-0"
                  >
                    <strong>{line.item.name}</strong>
                    <p className="mt-1 text-slate-600">
                      Despachado {line.dispatchedQuantity} · útil{" "}
                      {line.receivedUsableQuantity} · tránsito faltante{" "}
                      {line.transitMissingQuantity} · dañado{" "}
                      {line.receivedDamagedQuantity} · devuelto{" "}
                      {line.returnedQuantity}
                    </p>
                  </div>
                ))}
              </div>
              <details className="mt-4 rounded-xl border border-slate-200 p-3">
                <summary className="cursor-pointer font-bold">
                  Ver trazabilidad e incidencias
                </summary>
                <ol className="mt-3 space-y-2 border-l-2 border-blue-200 pl-4">
                  {transfer.custodyEvents.map((event) => (
                    <li key={event.id} className="text-sm min-w-0">
                      <strong>{event.type}</strong> ·{" "}
                      {formatDate(event.occurredAt)}
                      <span className="block text-slate-600">
                        {event.actor.name}: {event.declaration}
                      </span>
                    </li>
                  ))}
                </ol>
                {transfer.incidents.length > 0 ? (
                  <div className="mt-4 space-y-2 min-w-0">
                    <h4 className="font-semibold text-amber-900">
                      Incidencias
                    </h4>
                    {transfer.incidents.map((incident) => (
                      <div
                        key={incident.id}
                        className="rounded-lg bg-amber-50 p-3 text-sm min-w-0"
                      >
                        <strong>
                          {incident.type}
                          {incident.quantity ? ` · ${incident.quantity}` : ""}
                        </strong>
                        <p>{incident.description}</p>
                        {incident.evidenceReference ? (
                          <a
                            href={incident.evidenceReference}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-blue-700 underline"
                          >
                            Abrir referencia de evidencia
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </details>
              {canField && !overview.readOnly ? (
                <div className="mt-4 grid gap-3 xl:grid-cols-2 min-w-0">
                  {RECEIVE_STAGES.has(stage) &&
                  (transfer.status === "DISPATCHED" ||
                    transfer.status === "PARTIALLY_RECEIVED") ? (
                    <details className="rounded-xl border border-slate-200 p-3">
                      <summary className="cursor-pointer font-semibold">
                        Confirmar recepción
                      </summary>
                      <form
                        data-testid={`receive-${transfer.id}`}
                        onSubmit={(event) => submitReceive(event, transfer)}
                        className="mt-3 grid gap-3 min-w-0"
                      >
                        {transfer.lines.map((line) => {
                          const remaining =
                            line.dispatchedQuantity -
                            line.receivedUsableQuantity -
                            line.receivedDamagedQuantity -
                            line.transitMissingQuantity;
                          return (
                            <fieldset
                              key={line.id}
                              className="rounded-lg bg-slate-50 p-2"
                            >
                              <legend className="px-1 text-sm font-bold">
                                {line.item.name} · faltan {remaining}
                              </legend>
                              <div className="grid gap-2 min-w-0 grid-cols-1 sm:grid-cols-3">
                                <label className="text-sm min-w-0">
                                  Útil
                                  <input
                                    aria-label={`Útil ${line.item.name}`}
                                    type="number"
                                    name={`usable-${line.id}`}
                                    min={0}
                                    max={remaining}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2 min-w-0 max-w-full"
                                  />
                                </label>
                                <label className="text-sm min-w-0">
                                  Dañado
                                  <input
                                    aria-label={`Dañado ${line.item.name}`}
                                    type="number"
                                    name={`damaged-${line.id}`}
                                    min={0}
                                    max={remaining}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2 min-w-0 max-w-full"
                                  />
                                </label>
                                <label className="text-sm min-w-0">
                                  Faltante
                                  <input
                                    aria-label={`Faltante ${line.item.name}`}
                                    type="number"
                                    name={`missing-${line.id}`}
                                    min={0}
                                    max={remaining}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2 min-w-0 max-w-full"
                                  />
                                </label>
                              </div>
                            </fieldset>
                          );
                        })}
                        <label className="text-sm font-semibold min-w-0">
                          Declaración
                          <textarea
                            required
                            name="custodyDeclaration"
                            minLength={20}
                            maxLength={2000}
                            className="mt-1 min-h-20 w-full rounded-lg border p-2 min-w-0 max-w-full"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={Boolean(mutationKey)}
                          className="min-h-11 rounded-lg bg-blue-700 px-3 font-bold text-white max-w-full whitespace-normal"
                        >
                          {mutationKey === `receive-${transfer.id}`
                            ? "Confirmando…"
                            : "Registrar recepción"}
                        </button>
                      </form>
                    </details>
                  ) : null}
                  {RETURN_STAGES.has(stage) &&
                  [
                    "RECEIVED",
                    "RECEIVED_WITH_INCIDENT",
                    "PARTIALLY_RETURNED",
                  ].includes(transfer.status) ? (
                    <details className="rounded-xl border border-slate-200 p-3">
                      <summary className="cursor-pointer font-semibold">
                        Registrar devolución
                      </summary>
                      <form
                        data-testid={`return-${transfer.id}`}
                        onSubmit={(event) => submitReturn(event, transfer)}
                        className="mt-3 grid gap-3 min-w-0"
                      >
                        {transfer.lines.map((line) => {
                          const maximum =
                            line.receivedUsableQuantity - line.returnedQuantity;
                          return (
                            <label
                              key={line.id}
                              className="text-sm font-semibold min-w-0"
                            >
                              {line.item.name} · máximo {maximum}
                              <input
                                aria-label={`Devolver ${line.item.name}`}
                                type="number"
                                name={`return-${line.id}`}
                                min={0}
                                max={maximum}
                                defaultValue={0}
                                className="mt-1 min-h-10 w-full rounded border px-2 min-w-0 max-w-full"
                              />
                            </label>
                          );
                        })}
                        <label className="text-sm font-semibold min-w-0">
                          Declaración
                          <textarea
                            required
                            name="custodyDeclaration"
                            minLength={20}
                            maxLength={2000}
                            className="mt-1 min-h-20 w-full rounded-lg border p-2 min-w-0 max-w-full"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={Boolean(mutationKey)}
                          className="min-h-11 rounded-lg bg-blue-700 px-3 font-bold text-white max-w-full whitespace-normal"
                        >
                          {mutationKey === `return-${transfer.id}`
                            ? "Confirmando…"
                            : "Confirmar devolución"}
                        </button>
                      </form>
                    </details>
                  ) : null}
                  {canAdmin &&
                  RECONCILE_STAGES.has(stage) &&
                  [
                    "RECEIVED",
                    "RECEIVED_WITH_INCIDENT",
                    "PARTIALLY_RETURNED",
                    "RETURNED",
                  ].includes(transfer.status) ? (
                    <details className="rounded-xl border border-red-200 bg-red-50/40 p-3">
                      <summary className="cursor-pointer font-semibold text-red-950">
                        Conciliación definitiva
                      </summary>
                      <form
                        data-testid={`reconcile-${transfer.id}`}
                        onSubmit={(event) => submitReconcile(event, transfer)}
                        className="mt-3 grid gap-3 min-w-0"
                      >
                        {transfer.lines.map((line) => {
                          const pending =
                            line.receivedUsableQuantity -
                            line.returnedQuantity -
                            line.consumedQuantity -
                            line.custodyMissingQuantity -
                            line.custodyDamagedQuantity;
                          return (
                            <fieldset
                              key={line.id}
                              className="rounded-lg bg-white p-2"
                            >
                              <legend className="px-1 text-sm font-bold">
                                {line.item.name} · por explicar {pending}
                              </legend>
                              <div className="grid gap-2 min-w-0 grid-cols-1 sm:grid-cols-3">
                                <label className="text-sm min-w-0">
                                  Consumido
                                  <input
                                    type="number"
                                    name={`consumed-${line.id}`}
                                    min={0}
                                    max={pending}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2 min-w-0 max-w-full"
                                  />
                                </label>
                                <label className="text-sm min-w-0">
                                  Faltante
                                  <input
                                    type="number"
                                    name={`missing-${line.id}`}
                                    min={0}
                                    max={pending}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2 min-w-0 max-w-full"
                                  />
                                </label>
                                <label className="text-sm min-w-0">
                                  Dañado
                                  <input
                                    type="number"
                                    name={`damaged-${line.id}`}
                                    min={0}
                                    max={pending}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2 min-w-0 max-w-full"
                                  />
                                </label>
                              </div>
                            </fieldset>
                          );
                        })}
                        <label className="text-sm font-semibold min-w-0">
                          Explicación final
                          <textarea
                            required
                            name="reconciliationNote"
                            minLength={20}
                            maxLength={2000}
                            className="mt-1 min-h-20 w-full rounded-lg border p-2 min-w-0 max-w-full"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={Boolean(mutationKey)}
                          className="min-h-11 rounded-lg bg-red-700 px-3 font-bold text-white max-w-full whitespace-normal"
                        >
                          {mutationKey === `reconcile-${transfer.id}`
                            ? "Conciliando…"
                            : "Revisar y conciliar definitivamente"}
                        </button>
                      </form>
                    </details>
                  ) : null}
                  <details className="rounded-xl border border-amber-200 p-3">
                    <summary className="cursor-pointer font-semibold text-amber-950">
                      Reportar incidencia
                    </summary>
                    <form
                      data-testid={`incident-${transfer.id}`}
                      onSubmit={(event) => submitIncident(event, transfer)}
                      className="mt-3 grid gap-3 min-w-0"
                    >
                      <label className="text-sm font-semibold min-w-0">
                        Tipo
                        <select
                          name="type"
                          className="mt-1 min-h-11 w-full rounded-lg border px-2 min-w-0 max-w-full"
                        >
                          {INCIDENT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-semibold min-w-0">
                        Línea (opcional)
                        <select
                          name="lineId"
                          className="mt-1 min-h-11 w-full rounded-lg border px-2 min-w-0 max-w-full"
                        >
                          <option value="">Despacho completo</option>
                          {transfer.lines.map((line) => (
                            <option key={line.id} value={line.id}>
                              {line.item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-semibold min-w-0">
                        Cantidad (opcional)
                        <input
                          type="number"
                          name="quantity"
                          min={1}
                          max={1000000}
                          className="mt-1 min-h-11 w-full rounded-lg border px-2 min-w-0 max-w-full"
                        />
                      </label>
                      <label className="text-sm font-semibold min-w-0">
                        Descripción
                        <textarea
                          required
                          name="description"
                          minLength={20}
                          maxLength={2000}
                          className="mt-1 min-h-20 w-full rounded-lg border p-2 min-w-0 max-w-full"
                        />
                      </label>
                      <label className="text-sm font-semibold min-w-0">
                        Referencia HTTPS de evidencia (opcional)
                        <input
                          type="url"
                          name="evidenceReference"
                          maxLength={2048}
                          className="mt-1 min-h-11 w-full rounded-lg border px-2 min-w-0 max-w-full"
                        />
                      </label>
                      <label className="text-sm font-semibold min-w-0">
                        SHA-256 de evidencia (obligatorio con referencia)
                        <input
                          name="evidenceSha256"
                          pattern="[a-fA-F0-9]{64}"
                          className="mt-1 min-h-11 w-full rounded-lg border px-2 font-mono text-xs min-w-0 max-w-full"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={Boolean(mutationKey)}
                        className="min-h-11 rounded-lg bg-amber-700 px-3 font-bold text-white max-w-full whitespace-normal"
                      >
                        {mutationKey === `incident-${transfer.id}`
                          ? "Registrando…"
                          : "Registrar incidencia inmutable"}
                      </button>
                    </form>
                  </details>
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 min-w-0">
        <div className="flex gap-3 min-w-0">
          <ClipboardCheck className="shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Trabajo con conexión</h2>
            <p className="mt-1">
              Usa una conexión activa para registrar movimientos. Comprueba la
              confirmación y el saldo actualizado antes de entregar o recibir
              materiales.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
