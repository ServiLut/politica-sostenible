"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import { useAuth } from "@/context/auth";
import { useConfirmation } from "@/context/confirmation";
import { ApiError } from "@/lib/api-client";
import { listVotingPlaces, type VotingPlace } from "@/lib/election-api";
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
  type InventoryOverview,
  type InventoryTrackingMode,
  type InventoryTransfer,
} from "@/lib/inventory-logistics-api";
import type {
  BackendUserRole,
  PoliticalOperationStage,
} from "@/types/saas-schema";

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
  if (error instanceof ApiError) return error.message;
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
    ? `${label}: la API reconoció el reintento exacto; no duplicó el movimiento.`
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-black ${warning && value > 0 ? "text-amber-700" : "text-slate-950"}`}
      >
        {value.toLocaleString("es-CO")}
      </p>
    </div>
  );
}

export default function LogisticsPage() {
  const confirm = useConfirmation();
  const { user } = useAuth();
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [places, setPlaces] = useState<VotingPlace[]>([]);
  const [placesLimited, setPlacesLimited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [dispatchDestination, setDispatchDestination] = useState<
    "WAREHOUSE" | "POLLING_PLACE"
  >("POLLING_PLACE");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadError(null);
    const [inventory, votingPlaces] = await Promise.all([
      getInventoryOverview(signal),
      listVotingPlaces({ page: 1, limit: 100 }, signal),
    ]);
    if (signal?.aborted) return;
    setOverview(inventory);
    setPlaces(votingPlaces.items);
    setPlacesLimited(votingPlaces.pagination.totalPages > 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoadError(readableError(error));
          setOverview(null);
          setPlaces([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load, reloadVersion]);

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

  async function runMutation<T extends object>(
    key: string,
    label: string,
    action: () => Promise<InventoryCommandResponse<T>>,
    form?: HTMLFormElement,
  ) {
    setMutationKey(key);
    setMutationError(null);
    setNotice(null);
    try {
      const result = await action();
      setNotice(commandNotice(label, result));
      form?.reset();
      await load();
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutationKey(null);
    }
  }

  function submitWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void runMutation(
      "warehouse",
      "Bodega creada",
      () =>
        createInventoryWarehouse({
          clientRequestId: freshCommandId(),
          code: requiredText(data, "code"),
          name: requiredText(data, "name"),
          address: optionalText(data, "address"),
          responsibleUserId: optionalText(data, "responsibleUserId"),
        }),
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
      () =>
        importInventoryItems({
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
      () =>
        receiveInventoryStock({
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
    const place = places.find((candidate) => candidate.id === destinationId);
    void runMutation(
      "dispatch",
      "Despacho confirmado",
      () =>
        dispatchInventory({
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
          expectedReturnAt: isoFromLocal(
            optionalText(data, "expectedReturnAt"),
          ),
          lines,
        }),
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
      () =>
        receiveInventoryTransfer(transfer.id, {
          clientRequestId: freshCommandId(),
          expectedTransferUpdatedAt: transfer.updatedAt,
          custodyDeclaration: requiredText(data, "custodyDeclaration"),
          occurredAt: new Date().toISOString(),
          lines,
        }),
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
      () =>
        returnInventoryTransfer(transfer.id, {
          clientRequestId: freshCommandId(),
          expectedTransferUpdatedAt: transfer.updatedAt,
          custodyDeclaration: requiredText(data, "custodyDeclaration"),
          occurredAt: new Date().toISOString(),
          lines,
        }),
      form,
    );
  }

  async function submitReconcile(
    event: FormEvent<HTMLFormElement>,
    transfer: InventoryTransfer,
  ) {
    event.preventDefault();
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
    const form = event.currentTarget;
    const data = new FormData(form);
    void runMutation(
      `reconcile-${transfer.id}`,
      "Conciliación definitiva",
      () =>
        reconcileInventoryTransfer(transfer.id, {
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
      () =>
        reportInventoryIncident(transfer.id, {
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
      form,
    );
  }

  if (loading && !overview) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        aria-busy="true"
      >
        <Loader2 className="animate-spin text-blue-600" aria-hidden="true" />
        <span className="ml-3 font-semibold text-slate-700">
          Cargando inventario y custodias…
        </span>
      </div>
    );
  }

  if (loadError && !overview) {
    return (
      <div className="mx-auto max-w-3xl p-6" data-testid="inventory-load-error">
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-5"
        >
          <h1 className="text-xl font-black text-red-950">
            No se pudo abrir logística
          </h1>
          <p className="mt-2 text-sm text-red-800">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadVersion((version) => version + 1)}
            className="mt-4 min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white"
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
      className="mx-auto max-w-7xl space-y-6 p-4 pb-24 md:p-8"
      data-testid="inventory-page"
    >
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            Operación electoral · {stage.replaceAll("_", " ")}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
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
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-50"
        >
          <RefreshCw
            className={loading ? "animate-spin" : ""}
            size={17}
            aria-hidden="true"
          />
          Recargar saldos
        </button>
      </header>

      {overview.readOnly ? (
        <section
          role="status"
          className="rounded-2xl border border-slate-300 bg-slate-100 p-4"
        >
          <div className="flex gap-3">
            <ShieldCheck
              className="mt-0.5 shrink-0 text-slate-700"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-black text-slate-950">
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
          className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <AlertTriangle className="shrink-0" size={20} aria-hidden="true" />
          <p>{warning}</p>
        </div>
      ))}
      {placesLimited ? (
        <div
          role="note"
          className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"
        >
          El selector muestra los primeros 100 puestos oficiales. Use el código
          de puesto como filtro en Territorio antes de preparar despachos
          masivos; la API nunca acepta una mesa fuera del puesto activo.
        </div>
      ) : null}
      {mutationError ? (
        <div
          role="alert"
          data-testid="inventory-mutation-error"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-900"
        >
          {mutationError}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          data-testid="inventory-mutation-success"
          className="flex gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900"
        >
          <CheckCircle2 size={19} aria-hidden="true" /> {notice}
        </div>
      ) : null}

      <section
        aria-label="Resumen de inventario"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
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
          className="rounded-3xl border border-slate-200 bg-slate-50 p-4 md:p-6"
        >
          <div className="flex items-center gap-3">
            <Boxes className="text-blue-700" aria-hidden="true" />
            <div>
              <h2
                id="inventory-actions-title"
                className="text-xl font-black text-slate-950"
              >
                Preparar y despachar
              </h2>
              <p className="text-sm text-slate-600">
                Cada envío genera un recibo idempotente; no cierre ni recargue
                hasta ver confirmación.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {SETUP_STAGES.has(stage) ? (
              <details className="rounded-2xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer font-black text-slate-900">
                  Nueva bodega responsable
                </summary>
                <form
                  data-testid="create-warehouse-form"
                  onSubmit={submitWarehouse}
                  className="mt-4 grid gap-3"
                >
                  <label className="text-sm font-semibold">
                    Código
                    <input
                      required
                      name="code"
                      minLength={2}
                      maxLength={32}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 uppercase"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Nombre
                    <input
                      required
                      name="name"
                      minLength={3}
                      maxLength={160}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Dirección verificada (opcional)
                    <input
                      name="address"
                      maxLength={500}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Responsable
                    <select
                      name="responsibleUserId"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
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
                    className="min-h-11 rounded-xl bg-blue-700 px-4 font-bold text-white disabled:opacity-50"
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
                <summary className="cursor-pointer font-black text-slate-900">
                  Importar artículo validado
                </summary>
                <form
                  data-testid="item-import-form"
                  onSubmit={submitItem}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  <label className="text-sm font-semibold">
                    SKU
                    <input
                      required
                      name="sku"
                      minLength={2}
                      maxLength={64}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 uppercase"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Nombre
                    <input
                      required
                      name="name"
                      minLength={2}
                      maxLength={160}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Unidad
                    <input
                      required
                      name="unit"
                      defaultValue="UNIDAD"
                      maxLength={40}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 uppercase"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Trazabilidad
                    <select
                      name="trackingMode"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    >
                      <option value="NONE">Sin lote/serial</option>
                      <option value="LOT">Por lote</option>
                      <option value="SERIAL">Por serial</option>
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    Stock mínimo
                    <input
                      required
                      type="number"
                      name="minimumStock"
                      min={0}
                      max={1000000}
                      defaultValue={0}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    />
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2">
                    Descripción (opcional)
                    <textarea
                      name="description"
                      maxLength={1000}
                      className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={Boolean(mutationKey)}
                    className="min-h-11 rounded-xl bg-blue-700 px-4 font-bold text-white disabled:opacity-50 sm:col-span-2"
                  >
                    {mutationKey === "item"
                      ? "Importando…"
                      : "Importar fila JSON"}
                  </button>
                </form>
              </details>
            ) : null}

            {STOCK_STAGES.has(stage) ? (
              <details className="rounded-2xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer font-black text-slate-900">
                  Ingresar existencias
                </summary>
                <form
                  data-testid="stock-receive-form"
                  onSubmit={submitStock}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  <label className="text-sm font-semibold">
                    Bodega
                    <select
                      required
                      name="warehouseId"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
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
                  <label className="text-sm font-semibold">
                    Artículo
                    <select
                      required
                      name="itemId"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
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
                  <label className="text-sm font-semibold">
                    Cantidad
                    <input
                      required
                      type="number"
                      name="quantity"
                      min={1}
                      max={1000000}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Responsable
                    <select
                      name="responsibleUserId"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    >
                      <option value="">Responsable de bodega</option>
                      {overview.operators.map((operator) => (
                        <option key={operator.id} value={operator.id}>
                          {operator.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    Lote (sólo artículos por lote)
                    <input
                      name="lotNumber"
                      maxLength={120}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 uppercase"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Serial (sólo artículos serializados)
                    <input
                      name="serialNumber"
                      maxLength={160}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 uppercase"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Vencimiento verificable
                    <input
                      type="datetime-local"
                      name="expiresAt"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    />
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2">
                    Motivo
                    <input
                      required
                      name="reason"
                      minLength={10}
                      maxLength={1000}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    />
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2">
                    Declaración de custodia
                    <textarea
                      required
                      name="custodyDeclaration"
                      minLength={20}
                      maxLength={1000}
                      className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={Boolean(mutationKey)}
                    className="min-h-11 rounded-xl bg-blue-700 px-4 font-bold text-white disabled:opacity-50 sm:col-span-2"
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
                <summary className="cursor-pointer font-black text-slate-900">
                  Despachar kit o materiales
                </summary>
                <form
                  data-testid="dispatch-form"
                  onSubmit={submitDispatch}
                  className="mt-4 grid gap-4"
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm font-semibold">
                      Código de despacho
                      <input
                        required
                        name="code"
                        minLength={3}
                        maxLength={64}
                        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 uppercase"
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Bodega origen
                      <select
                        required
                        name="sourceWarehouseId"
                        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
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
                    <label className="text-sm font-semibold">
                      Custodio
                      <select
                        required
                        name="custodianUserId"
                        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
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
                    <legend className="px-1 text-sm font-black">
                      Tipo de destino
                    </legend>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="radio"
                          checked={dispatchDestination === "POLLING_PLACE"}
                          onChange={() =>
                            setDispatchDestination("POLLING_PLACE")
                          }
                        />
                        Puesto / mesa oficial
                      </label>
                      <label className="flex min-h-11 items-center gap-2">
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
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm font-semibold">
                        Puesto electoral
                        <select
                          required
                          name="destinationId"
                          className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                        >
                          <option value="">Seleccione puesto activo</option>
                          {places.map((place) => (
                            <option key={place.id} value={place.id}>
                              {place.code} · {place.name}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          No se inventan dirección ni coordenadas: sólo código y
                          nombre oficiales disponibles.
                        </span>
                      </label>
                      <label className="text-sm font-semibold">
                        Mesa específica (opcional)
                        <input
                          type="number"
                          name="destinationTableNumber"
                          min={1}
                          max={10000}
                          className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="text-sm font-semibold">
                      Bodega destino
                      <select
                        required
                        name="destinationId"
                        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
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
                    <legend className="px-1 text-sm font-black">
                      Existencias del kit
                    </legend>
                    <div className="grid gap-2">
                      {availableBalances.length === 0 ? (
                        <p className="text-sm text-amber-800">
                          No hay saldos disponibles.
                        </p>
                      ) : (
                        availableBalances.map((balance) => (
                          <div
                            key={balance.id}
                            className="grid items-center gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[auto_1fr_8rem]"
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
                            <label className="text-xs font-semibold">
                              Cantidad
                              <input
                                aria-label={`Cantidad ${balance.item.name}`}
                                type="number"
                                name={`quantity-${balance.id}`}
                                min={1}
                                max={balance.quantity}
                                defaultValue={1}
                                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2"
                              />
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  </fieldset>
                  <label className="text-sm font-semibold">
                    Propósito operativo
                    <textarea
                      required
                      name="purpose"
                      minLength={20}
                      maxLength={1000}
                      className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Declaración de entrega y custodia
                    <textarea
                      required
                      name="custodyDeclaration"
                      minLength={20}
                      maxLength={1000}
                      className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Retorno esperado (opcional)
                    <input
                      type="datetime-local"
                      name="expectedReturnAt"
                      className="mt-1 min-h-11 rounded-xl border border-slate-300 px-3"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={
                      Boolean(mutationKey) || availableBalances.length === 0
                    }
                    className="min-h-11 rounded-xl bg-blue-700 px-4 font-bold text-white disabled:opacity-50"
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
        className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6"
      >
        <div className="flex items-center gap-3">
          <Warehouse className="text-blue-700" aria-hidden="true" />
          <h2 id="stock-title" className="text-xl font-black">
            Existencias verificables
          </h2>
        </div>
        {overview.balances.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            Aún no hay saldos. Cree bodega, artículo y registre el ingreso
            físico.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-slate-500">
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
                    <td className="p-2">{balance.condition}</td>
                    <td className="p-2 text-right text-lg font-black">
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

      <section aria-labelledby="transfers-title" className="space-y-4">
        <div className="flex items-center gap-3">
          <Truck className="text-blue-700" aria-hidden="true" />
          <h2 id="transfers-title" className="text-xl font-black">
            Despachos y cadena de custodia
          </h2>
        </div>
        {overview.transfers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            No hay despachos registrados.
          </div>
        ) : (
          overview.transfers.map((transfer) => (
            <article
              key={transfer.id}
              data-testid={`transfer-${transfer.id}`}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-blue-700">
                    {transfer.code}
                  </p>
                  <h3 className="text-lg font-black text-slate-950">
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
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-800">
                  {STATUS_LABELS[transfer.status]}
                </span>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {transfer.lines.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-xl bg-slate-50 p-3 text-sm"
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
                    <li key={event.id} className="text-sm">
                      <strong>{event.type}</strong> ·{" "}
                      {formatDate(event.occurredAt)}
                      <span className="block text-slate-600">
                        {event.actor.name}: {event.declaration}
                      </span>
                    </li>
                  ))}
                </ol>
                {transfer.incidents.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <h4 className="font-black text-amber-900">Incidencias</h4>
                    {transfer.incidents.map((incident) => (
                      <div
                        key={incident.id}
                        className="rounded-lg bg-amber-50 p-3 text-sm"
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
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {RECEIVE_STAGES.has(stage) &&
                  (transfer.status === "DISPATCHED" ||
                    transfer.status === "PARTIALLY_RECEIVED") ? (
                    <details className="rounded-xl border border-slate-200 p-3">
                      <summary className="cursor-pointer font-black">
                        Confirmar recepción
                      </summary>
                      <form
                        data-testid={`receive-${transfer.id}`}
                        onSubmit={(event) => submitReceive(event, transfer)}
                        className="mt-3 grid gap-3"
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
                              <div className="grid grid-cols-3 gap-2">
                                <label className="text-xs">
                                  Útil
                                  <input
                                    aria-label={`Útil ${line.item.name}`}
                                    type="number"
                                    name={`usable-${line.id}`}
                                    min={0}
                                    max={remaining}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2"
                                  />
                                </label>
                                <label className="text-xs">
                                  Dañado
                                  <input
                                    aria-label={`Dañado ${line.item.name}`}
                                    type="number"
                                    name={`damaged-${line.id}`}
                                    min={0}
                                    max={remaining}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2"
                                  />
                                </label>
                                <label className="text-xs">
                                  Faltante
                                  <input
                                    aria-label={`Faltante ${line.item.name}`}
                                    type="number"
                                    name={`missing-${line.id}`}
                                    min={0}
                                    max={remaining}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2"
                                  />
                                </label>
                              </div>
                            </fieldset>
                          );
                        })}
                        <label className="text-sm font-semibold">
                          Declaración
                          <textarea
                            required
                            name="custodyDeclaration"
                            minLength={20}
                            maxLength={2000}
                            className="mt-1 min-h-20 w-full rounded-lg border p-2"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={Boolean(mutationKey)}
                          className="min-h-11 rounded-lg bg-blue-700 px-3 font-bold text-white"
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
                      <summary className="cursor-pointer font-black">
                        Registrar devolución
                      </summary>
                      <form
                        data-testid={`return-${transfer.id}`}
                        onSubmit={(event) => submitReturn(event, transfer)}
                        className="mt-3 grid gap-3"
                      >
                        {transfer.lines.map((line) => {
                          const maximum =
                            line.receivedUsableQuantity - line.returnedQuantity;
                          return (
                            <label
                              key={line.id}
                              className="text-sm font-semibold"
                            >
                              {line.item.name} · máximo {maximum}
                              <input
                                aria-label={`Devolver ${line.item.name}`}
                                type="number"
                                name={`return-${line.id}`}
                                min={0}
                                max={maximum}
                                defaultValue={0}
                                className="mt-1 min-h-10 w-full rounded border px-2"
                              />
                            </label>
                          );
                        })}
                        <label className="text-sm font-semibold">
                          Declaración
                          <textarea
                            required
                            name="custodyDeclaration"
                            minLength={20}
                            maxLength={2000}
                            className="mt-1 min-h-20 w-full rounded-lg border p-2"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={Boolean(mutationKey)}
                          className="min-h-11 rounded-lg bg-blue-700 px-3 font-bold text-white"
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
                      <summary className="cursor-pointer font-black text-red-950">
                        Conciliación definitiva
                      </summary>
                      <form
                        data-testid={`reconcile-${transfer.id}`}
                        onSubmit={(event) => submitReconcile(event, transfer)}
                        className="mt-3 grid gap-3"
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
                              <div className="grid grid-cols-3 gap-2">
                                <label className="text-xs">
                                  Consumido
                                  <input
                                    type="number"
                                    name={`consumed-${line.id}`}
                                    min={0}
                                    max={pending}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2"
                                  />
                                </label>
                                <label className="text-xs">
                                  Faltante
                                  <input
                                    type="number"
                                    name={`missing-${line.id}`}
                                    min={0}
                                    max={pending}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2"
                                  />
                                </label>
                                <label className="text-xs">
                                  Dañado
                                  <input
                                    type="number"
                                    name={`damaged-${line.id}`}
                                    min={0}
                                    max={pending}
                                    defaultValue={0}
                                    className="mt-1 min-h-10 w-full rounded border px-2"
                                  />
                                </label>
                              </div>
                            </fieldset>
                          );
                        })}
                        <label className="text-sm font-semibold">
                          Explicación final
                          <textarea
                            required
                            name="reconciliationNote"
                            minLength={20}
                            maxLength={2000}
                            className="mt-1 min-h-20 w-full rounded-lg border p-2"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={Boolean(mutationKey)}
                          className="min-h-11 rounded-lg bg-red-700 px-3 font-bold text-white"
                        >
                          {mutationKey === `reconcile-${transfer.id}`
                            ? "Conciliando…"
                            : "Revisar y conciliar definitivamente"}
                        </button>
                      </form>
                    </details>
                  ) : null}
                  <details className="rounded-xl border border-amber-200 p-3">
                    <summary className="cursor-pointer font-black text-amber-950">
                      Reportar incidencia
                    </summary>
                    <form
                      data-testid={`incident-${transfer.id}`}
                      onSubmit={(event) => submitIncident(event, transfer)}
                      className="mt-3 grid gap-3"
                    >
                      <label className="text-sm font-semibold">
                        Tipo
                        <select
                          name="type"
                          className="mt-1 min-h-11 w-full rounded-lg border px-2"
                        >
                          {INCIDENT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-semibold">
                        Línea (opcional)
                        <select
                          name="lineId"
                          className="mt-1 min-h-11 w-full rounded-lg border px-2"
                        >
                          <option value="">Despacho completo</option>
                          {transfer.lines.map((line) => (
                            <option key={line.id} value={line.id}>
                              {line.item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-semibold">
                        Cantidad (opcional)
                        <input
                          type="number"
                          name="quantity"
                          min={1}
                          max={1000000}
                          className="mt-1 min-h-11 w-full rounded-lg border px-2"
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        Descripción
                        <textarea
                          required
                          name="description"
                          minLength={20}
                          maxLength={2000}
                          className="mt-1 min-h-20 w-full rounded-lg border p-2"
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        Referencia HTTPS de evidencia (opcional)
                        <input
                          type="url"
                          name="evidenceReference"
                          maxLength={2048}
                          className="mt-1 min-h-11 w-full rounded-lg border px-2"
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        SHA-256 de evidencia (obligatorio con referencia)
                        <input
                          name="evidenceSha256"
                          pattern="[a-fA-F0-9]{64}"
                          className="mt-1 min-h-11 w-full rounded-lg border px-2 font-mono text-xs"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={Boolean(mutationKey)}
                        className="min-h-11 rounded-lg bg-amber-700 px-3 font-bold text-white"
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

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <div className="flex gap-3">
          <ClipboardCheck className="shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-black">Límites deliberados</h2>
            <p className="mt-1">
              La importación viaja como JSON validado (máximo 100 filas), nunca
              como archivo binario. La evidencia de incidencias usa referencia
              HTTPS + SHA-256; la carga binaria dedicada queda fuera de este
              módulo. No se guarda una copia offline del inventario para no
              mezclarla con la bóveda E-14 sin un modelo de autorización y
              revocación específico.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
