"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import {
  type IncidentMunicipality,
  type IncidentMunicipalityPage,
  type MunicipalityQuery,
  listIncidentMunicipalities,
  municipalityLabel,
  municipalityQueryReducer,
} from "../../lib/incident-municipalities";
import { startDebouncedRequest } from "../ui/debounced-request";
import { handleUserComboboxSearchKeyDown } from "../ui/user-combobox-query";

interface Props {
  value: IncidentMunicipality | null;
  onChange: (municipality: IncidentMunicipality | null) => void;
  disabled?: boolean;
  ariaLabel: string;
}

/** Only mounts a request while open; cards do not each download the catalogue. */
export function IncidentMunicipalitySelector({
  value,
  onChange,
  disabled = false,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, dispatch] = useReducer(municipalityQueryReducer, {
    search: "",
    page: 1,
    revision: 0,
  });
  const [response, setResponse] = useState<{
    query: MunicipalityQuery;
    page: IncidentMunicipalityPage | null;
    error: boolean;
  } | null>(null);
  const current = response?.query === query ? response : null;
  const loading = open && !disabled && !current;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open || disabled) return;
    return startDebouncedRequest(
      (signal) => listIncidentMunicipalities(query.search, query.page, signal),
      (page) => setResponse({ query, page, error: false }),
      () => setResponse({ query, page: null, error: true }),
      300,
    );
  }, [query, open, disabled]);

  function select(municipality: IncidentMunicipality | null) {
    onChange(municipality);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div
      className="min-w-0 w-full"
      data-escape-dismiss={open && !disabled ? "true" : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open || disabled) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-describedby={`${id}-selection`}
        aria-controls={open && !disabled ? `${id}-options` : undefined}
        aria-expanded={open && !disabled}
        disabled={disabled}
        onClick={() => {
          if (!open) dispatch({ type: "retry" });
          setOpen(!open);
        }}
        className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
      >
        <span id={`${id}-selection`} className="min-w-0 break-words">
          {value ? municipalityLabel(value) : "Sin municipio vinculado"}
        </span>
        <ChevronsUpDown aria-hidden="true" size={17} className="shrink-0" />
      </button>
      {open && !disabled && (
        <section
          id={`${id}-options`}
          aria-label="Buscar y elegir municipio"
          className="mt-2 min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-2"
        >
          <input
            ref={searchRef}
            autoFocus
            aria-label="Buscar municipio por nombre o código"
            placeholder="Nombre o código DANE"
            maxLength={100}
            value={query.search}
            onChange={(event) => dispatch({ type: "search", value: event.target.value })}
            onKeyDown={handleUserComboboxSearchKeyDown}
            className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {loading && (
            <p role="status" className="flex gap-2 p-2 text-sm text-slate-600">
              <Loader2 aria-hidden="true" size={18} className="animate-spin" />
              Buscando municipios…
            </p>
          )}
          {current?.error && (
            <div role="alert" className="space-y-2 p-2 text-sm text-red-800">
              <p>No se pudieron cargar los municipios. La selección se conserva.</p>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-red-200 px-3 py-2 font-semibold"
                onClick={() => {
                  searchRef.current?.focus();
                  dispatch({ type: "retry" });
                }}
              >
                Reintentar municipios
              </button>
            </div>
          )}
          <div className="max-h-56 space-y-1 overflow-y-auto" aria-busy={loading}>
            <button
              type="button"
              onClick={() => select(null)}
              className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus:ring-2 focus:ring-blue-600"
            >
              Sin municipio vinculado
            </button>
            {current?.page?.items.map((municipality) => (
              <button
                key={municipality.id}
                type="button"
                aria-pressed={value?.id === municipality.id}
                onClick={() => select(municipality)}
                className="flex min-h-11 w-full min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-normal text-slate-800 hover:bg-slate-100 focus:ring-2 focus:ring-blue-600"
              >
                <Check aria-hidden="true" size={17} className={`mt-0.5 shrink-0 ${value?.id === municipality.id ? "visible" : "invisible"}`} />
                <span className="min-w-0 break-words">{municipalityLabel(municipality)}</span>
              </button>
            ))}
          </div>
          {current?.page && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
              <p role="status" className="w-full text-slate-600">
                {current.page.pagination.total === 0
                  ? "No se encontraron municipios."
                  : `Página ${query.page} de ${Math.max(1, current.page.pagination.totalPages)} · ${current.page.pagination.total} ${current.page.pagination.total === 1 ? "municipio" : "municipios"}`}
              </p>
              <button type="button" disabled={loading || query.page <= 1}
                onClick={() => dispatch({ type: "page", value: query.page - 1 })}
                className="min-h-11 rounded-lg px-3 py-2 font-semibold disabled:opacity-50">
                Municipios anteriores
              </button>
              <button type="button" disabled={loading || query.page >= current.page.pagination.totalPages}
                onClick={() => dispatch({ type: "page", value: query.page + 1 })}
                className="min-h-11 rounded-lg px-3 py-2 font-semibold disabled:opacity-50">
                Municipios siguientes
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
