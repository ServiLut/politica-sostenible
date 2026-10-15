"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Loader2,
  AlertCircle,
  ArrowUpRight,
  RotateCw,
  X,
} from "lucide-react";
import {
  flattenGlobalSearch,
  GlobalSearchResult,
  searchGlobally,
} from "@/lib/search-api";
import { startDebouncedRequest } from "./debounced-request";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { GLOBAL_SEARCH_OPEN_EVENT } from "@/lib/global-search";
import { useAuth } from "@/context/auth";
import { navigationGroups } from "@/config/navigation";
import { searchNavigation } from "./navigation-search";

const CATEGORY_LABELS: Record<string, string> = {
  Voters: "Personas",
  Users: "Equipo",
  Proposals: "Propuestas",
  Tasks: "Tareas",
  Commitments: "Compromisos",
  Cases: "Atención ciudadana",
  Incidents: "Incidentes y crisis",
  Pqrsd: "PQRSD formal",
};

export function CommandPalette() {
  const { user, tenant, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [searchResponse, setSearchResponse] = useState<{
    query: string;
    contextKey: string;
    attempt: number;
    results: GlobalSearchResult[];
    error: boolean;
  } | null>(null);
  const normalizedQuery = query.trim();
  const contextReady = Boolean(user && tenant && !authLoading);
  const contextKey = contextReady
    ? JSON.stringify([
        user?.id,
        user?.role,
        user?.backendRole,
        tenant?.id,
        tenant?.type,
        tenant?.operationStage,
      ])
    : "";
  const currentResponse =
    searchResponse?.query === normalizedQuery &&
    searchResponse.contextKey === contextKey &&
    searchResponse.attempt === attempt
      ? searchResponse
      : null;
  const results = currentResponse?.results ?? [];
  const sections = contextReady
    ? searchNavigation(normalizedQuery, user, tenant)
    : [];
  const loading =
    open && contextReady && normalizedQuery.length >= 3 && !currentResponse;
  const error = currentResponse?.error ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(true);

  const closePalette = useCallback((restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
    setQuery("");
    setSearchResponse(null);
    setAttempt(0);
  }, []);

  const openPalette = useCallback(() => {
    restoreFocusRef.current = true;
    setOpen(true);
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      if (document.querySelector('[aria-modal="true"]')) return;
      openPalette();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        if (!open && document.querySelector('[aria-modal="true"]')) return;
        e.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(GLOBAL_SEARCH_OPEN_EVENT, handleOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(GLOBAL_SEARCH_OPEN_EVENT, handleOpen);
    };
  }, [closePalette, open, openPalette]);

  useAccessibleDialog({
    open,
    containerRef: dialogRef,
    initialFocusRef: inputRef,
    restoreFocusRef,
    onClose: closePalette,
  });

  useEffect(() => {
    if (!open || !contextKey || normalizedQuery.length < 3) {
      return;
    }

    return startDebouncedRequest(
      (signal) => searchGlobally(normalizedQuery, signal),
      (data) => {
        setSearchResponse({
          query: normalizedQuery,
          contextKey,
          attempt,
          results: flattenGlobalSearch(data),
          error: false,
        });
      },
      () => {
        setSearchResponse({
          query: normalizedQuery,
          contextKey,
          attempt,
          results: [],
          error: true,
        });
      },
      300,
    );
  }, [open, normalizedQuery, contextKey, attempt]);

  if (!open) return null;

  const grouped = results.reduce(
    (acc, result) => {
      acc[result.category] = acc[result.category] || [];
      acc[result.category].push(result);
      return acc;
    },
    {} as Record<string, GlobalSearchResult[]>,
  );

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/55 p-3 pt-[min(12vh,6rem)] backdrop-blur-sm sm:p-5 sm:pt-[min(12vh,6rem)]"
      onClick={() => closePalette()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-6rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center border-b border-slate-200 px-4 py-3">
          <Search
            aria-hidden="true"
            className="mr-3 text-slate-400"
            size={20}
          />
          <input
            ref={inputRef}
            type="search"
            aria-label="Buscar en la organización"
            aria-describedby="global-search-help"
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-1 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600/25"
            placeholder="Buscar una sección o un registro…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && (
            <Loader2
              aria-label="Buscando"
              className="animate-spin text-slate-400"
              size={20}
            />
          )}
          <button
            type="button"
            aria-label="Cerrar búsqueda"
            onClick={() => closePalette()}
            className="ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-2">
          <p
            id="global-search-help"
            className="px-3 py-3 text-sm leading-relaxed text-slate-600"
          >
            {normalizedQuery.length < 3
              ? "Abre una sección o escribe al menos 3 caracteres para buscar registros."
              : "Secciones del programa y registros de tu organización a los que tienes acceso."}
          </p>

          {sections.length > 0 && (
            <section aria-label="Secciones disponibles" className="mb-3">
              <h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {normalizedQuery
                  ? "Ir a una sección"
                  : "Accesos para tu trabajo"}
              </h2>
              {sections.map((section) => (
                <a
                  key={section.href}
                  href={section.href}
                  onClick={() => closePalette(false)}
                  className="group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                    <div className="font-medium text-slate-900">
                      {section.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {
                        navigationGroups.find(
                          (group) => group.id === section.group,
                        )?.title
                      }{" "}
                      · Abrir sección
                    </div>
                  </div>
                  <ArrowUpRight
                    aria-hidden="true"
                    size={17}
                    className="shrink-0 text-slate-400 group-hover:text-blue-700"
                  />
                </a>
              ))}
            </section>
          )}

          {error && (
            <div
              role="alert"
              className="m-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950"
            >
              <div className="flex items-start gap-2">
                <AlertCircle
                  aria-hidden="true"
                  size={18}
                  className="mt-0.5 shrink-0"
                />
                <p className="text-sm leading-relaxed">
                  No pudimos buscar los registros. Puedes reintentar o abrir una
                  sección.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  inputRef.current?.focus();
                  setAttempt((value) => value + 1);
                }}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <RotateCw aria-hidden="true" size={16} /> Reintentar búsqueda
              </button>
            </div>
          )}

          {query.trim().length >= 3 &&
            results.length === 0 &&
            !loading &&
            !error && (
              <div className="min-w-0 overflow-y-auto break-words p-6 text-center text-sm text-slate-500 [overflow-wrap:anywhere]">
                {sections.length ? (
                  <>
                    No hay registros para &quot;{query}&quot;. Puedes abrir una
                    de las secciones anteriores.
                  </>
                ) : (
                  <>No se encontraron resultados para &quot;{query}&quot;</>
                )}
              </div>
            )}

          {Object.entries(grouped).length > 0 && (
            <div aria-label="Registros encontrados">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="mb-4">
                  <div className="px-3 py-2 text-sm font-semibold text-slate-500">
                    {CATEGORY_LABELS[category] ?? category}
                  </div>
                  {items.map((item) => (
                    <a
                      key={`${item.category}:${item.id}`}
                      href={item.href}
                      onClick={() => closePalette(false)}
                      className="block min-h-11 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <div className="break-words font-medium text-slate-900 [overflow-wrap:anywhere]">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="break-words text-sm text-slate-500 [overflow-wrap:anywhere]">
                          {item.subtitle}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-500">
          Tab para moverte · Enter para abrir · Esc para cerrar
        </div>
      </div>
    </div>
  );
}
