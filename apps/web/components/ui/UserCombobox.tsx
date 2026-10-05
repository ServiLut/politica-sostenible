"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { startDebouncedRequest } from "./debounced-request";
import { getRoleLabel } from "../../config/navigation";
import type { BackendUserRole } from "../../types/saas-schema";
import {
  userComboboxQueryReducer,
  handleUserComboboxSearchKeyDown,
  type UserComboboxQuery,
} from "./user-combobox-query";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ComboboxUser {
  id: string;
  name: string;
  role: string;
}

export interface ComboboxPaginationResult {
  items: ComboboxUser[];
  pagination?: { page: number; totalPages: number; total: number };
}

interface UserComboboxProps {
  value: string;
  onChange: (value: string, selectedUser?: ComboboxUser | null) => void;
  className?: string;
  name?: string;
  allowUnassigned?: boolean;
  selectedLabel?: string;
  disabled?: boolean;
  paginated?: boolean;
  ariaLabel?: string;
  fetchItems: (
    search: string,
    signal: AbortSignal,
    page?: number,
  ) => Promise<ComboboxPaginationResult>;
}

export function UserCombobox({
  value,
  onChange,
  className,
  name,
  fetchItems,
  allowUnassigned = true,
  selectedLabel,
  disabled = false,
  paginated = false,
  ariaLabel,
}: UserComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, dispatchQuery] = useReducer(userComboboxQueryReducer, {
    search: "",
    page: 1,
    revision: 0,
  });
  const { search, page } = query;
  const [response, setResponse] = useState<{
    query: UserComboboxQuery;
    fetchItems: UserComboboxProps["fetchItems"];
    items: ComboboxUser[];
    pagination?: ComboboxPaginationResult["pagination"];
    error: boolean;
  } | null>(null);
  const currentResponse =
    response?.query === query && response.fetchItems === fetchItems
      ? response
      : null;
  const items = currentResponse?.items ?? [];
  const loading = open && !disabled && !currentResponse;
  const error = currentResponse?.error ?? false;
  const pagination =
    response?.query.search === search && response.fetchItems === fetchItems
      ? response.pagination
      : undefined;
  const [selectedUser, setSelectedUser] = useState<ComboboxUser | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedValueId = useId();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open || disabled) return;

    return startDebouncedRequest(
      (signal) => fetchItems(query.search, signal, query.page),
      (res) =>
        setResponse({
          query,
          fetchItems,
          items: res.items,
          pagination: res.pagination,
          error: false,
        }),
      () => setResponse({ query, fetchItems, items: [], error: true }),
      400,
    );
  }, [query, open, fetchItems, disabled]);

  const displayValue =
    (selectedUser?.id === value ? selectedUser.name : null) ||
    items.find((i) => i.id === value)?.name ||
    (value
      ? selectedLabel || "Responsable seleccionado"
      : allowUnassigned
        ? "Por asignar"
        : "Selecciona un responsable");

  return (
    <div
      className={cn("relative min-w-0 w-full", className)}
      ref={containerRef}
      data-escape-dismiss={open && !disabled ? "true" : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open && !disabled) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-describedby={ariaLabel ? selectedValueId : undefined}
        aria-expanded={open && !disabled}
        disabled={disabled}
        onClick={() => {
          if (!open) dispatchQuery({ type: "retry" });
          setOpen(!open);
        }}
        className="flex min-w-0 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2 min-h-12 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
      >
        <span
          id={selectedValueId}
          className="min-w-0 whitespace-normal break-words text-left"
        >
          {displayValue}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
          <div className="flex items-center border-b border-slate-100 px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              autoFocus
              className="flex h-11 min-w-0 w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-400"
              placeholder="Buscar usuario..."
              aria-label="Buscar usuario para asignar"
              value={search}
              maxLength={100}
              onKeyDown={handleUserComboboxSearchKeyDown}
              onChange={(e) =>
                dispatchQuery({ type: "search", value: e.target.value })
              }
            />
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            )}
          </div>
          <div className="max-h-60 overflow-y-auto p-1" aria-busy={loading}>
            {loading && (
              <p role="status" className="px-3 py-4 text-sm text-slate-500">
                Buscando usuarios…
              </p>
            )}
            {error && (
              <div
                role="alert"
                className="space-y-2 px-3 py-4 text-sm text-red-700"
              >
                <p>
                  No se pudieron cargar los usuarios. La selección se conserva.
                </p>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-red-200 px-3 py-2 font-semibold"
                  onClick={() => {
                    searchRef.current?.focus();
                    dispatchQuery({ type: "retry" });
                  }}
                >
                  Reintentar búsqueda
                </button>
              </div>
            )}
            {items.length === 0 && !loading && !error && (
              <div className="py-6 text-center text-sm text-slate-500">
                No se encontraron usuarios.
              </div>
            )}

            {allowUnassigned && (
              <button
                type="button"
                className={cn(
                  "relative flex min-h-11 w-full cursor-default select-none items-center rounded-xl px-2 py-2.5 text-sm outline-none hover:bg-slate-100 focus:bg-slate-100",
                  value === "" && "bg-slate-50",
                )}
                onClick={() => {
                  onChange("", null);
                  setSelectedUser(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === "" ? "opacity-100" : "opacity-0",
                  )}
                />
                <span>Por asignar</span>
              </button>
            )}

            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "relative flex min-h-11 w-full cursor-default select-none items-center gap-1 rounded-xl px-2 py-2.5 text-sm outline-none hover:bg-slate-100 focus:bg-slate-100",
                  value === item.id && "bg-slate-50",
                )}
                onClick={() => {
                  onChange(item.id, item);
                  setSelectedUser(item);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === item.id ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="min-w-0 flex-1 break-words text-left">
                  {item.name}
                </span>
                <span className="ml-auto max-w-[44%] shrink-0 break-words text-right text-xs text-slate-500">
                  {getRoleLabel(item.role as BackendUserRole) ||
                    "Rol no disponible"}
                </span>
              </button>
            ))}
          </div>
          {paginated && pagination && !error && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-2 py-2 text-sm">
              <p role="status" className="w-full text-slate-600">
                Página {page} · {pagination.total} resultados
              </p>
              <button
                type="button"
                className="min-h-11 rounded-lg px-3 py-2 font-semibold hover:bg-slate-100 disabled:opacity-50"
                disabled={loading || page <= 1}
                onClick={() =>
                  dispatchQuery({
                    type: "page",
                    value: Math.max(
                      1,
                      Math.min(page - 1, pagination.totalPages),
                    ),
                  })
                }
              >
                Anterior
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg px-3 py-2 font-semibold hover:bg-slate-100 disabled:opacity-50"
                disabled={loading || page >= pagination.totalPages}
                onClick={() => dispatchQuery({ type: "page", value: page + 1 })}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
