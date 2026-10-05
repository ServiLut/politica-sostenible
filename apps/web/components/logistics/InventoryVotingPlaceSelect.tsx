"use client";

import { useCallback, useId, useState } from "react";
import type { VotingPlace } from "@/lib/election-api";
import { ApiError } from "@/lib/api-client";
import { usePageRequest } from "@/lib/use-page-request";
import {
  changeInventoryPlaceSearch,
  inventoryPlaceOptions,
  loadInventoryVotingPlaces,
} from "@/lib/inventory-voting-places";

export function InventoryVotingPlaceSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: VotingPlace | null;
  onChange: (place: VotingPlace | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(() => changeInventoryPlaceSearch(""));
  const request = useCallback(
    (signal: AbortSignal) => loadInventoryVotingPlaces(query, signal),
    [query],
  );
  const { data, error, loading, refresh } = usePageRequest(request);
  const options = inventoryPlaceOptions(data?.items ?? [], value);
  function searchPlaces() {
    setQuery(changeInventoryPlaceSearch(search));
  }
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={`${id}-search`} className="block text-sm font-semibold">
        Buscar puesto por código o nombre
      </label>
      <div className="flex min-w-0 flex-wrap gap-2">
        <input
          id={`${id}-search`}
          type="search"
          value={search}
          disabled={disabled}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              searchPlaces();
            }
          }}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={searchPlaces}
          className="min-h-11 rounded-xl border px-3"
        >
          Buscar
        </button>
      </div>
      <label htmlFor={`${id}-place`} className="block text-sm font-semibold">
        Puesto electoral
      </label>
      <select
        id={`${id}-place`}
        name="destinationId"
        required
        value={value?.id ?? ""}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            options.find((place) => place.id === event.target.value) ?? null,
          )
        }
        aria-describedby={`${id}-selection`}
        className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-slate-300 px-3"
      >
        <option value="">Seleccione puesto activo</option>
        {options.map((place) => (
          <option key={place.id} value={place.id}>
            {place.code} · {place.name}
          </option>
        ))}
      </select>
      <p
        id={`${id}-selection`}
        className="text-xs text-slate-600 [overflow-wrap:anywhere]"
      >
        {value
          ? `Seleccionado: ${value.code} · ${value.name}. Se conserva al cambiar de búsqueda o página.`
          : "Sólo puestos oficiales. Busca por código o nombre y recorre sus páginas."}
      </p>
      {loading ? (
        <p role="status" className="text-sm">
          Buscando puestos…
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="text-sm text-red-800">
          {error instanceof ApiError
            ? error.message
            : "No se pudo consultar los puestos."}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={disabled || loading}
            className="ml-2 min-h-11 underline"
          >
            Reintentar consulta
          </button>
        </div>
      ) : null}
      {data ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            disabled={disabled || loading || query.page <= 1}
            onClick={() =>
              setQuery((current) => ({ ...current, page: current.page - 1 }))
            }
            className="min-h-11 rounded-xl border px-3 disabled:opacity-50"
          >
            Anterior
          </button>
          <span role="status">
            Página {data.pagination.page} de{" "}
            {Math.max(1, data.pagination.totalPages)} · {data.pagination.total}{" "}
            puestos
          </span>
          <button
            type="button"
            disabled={
              disabled || loading || query.page >= data.pagination.totalPages
            }
            onClick={() =>
              setQuery((current) => ({ ...current, page: current.page + 1 }))
            }
            className="min-h-11 rounded-xl border px-3 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </div>
  );
}
