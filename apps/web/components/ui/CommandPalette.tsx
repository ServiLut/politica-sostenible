"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Search, Loader2, AlertCircle, X } from "lucide-react";
import {
  flattenGlobalSearch,
  GlobalSearchResult,
  searchGlobally,
} from "@/lib/search-api";
import { startDebouncedRequest } from "./debounced-request";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { GLOBAL_SEARCH_OPEN_EVENT } from "@/lib/global-search";

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResponse, setSearchResponse] = useState<{
    query: string;
    results: GlobalSearchResult[];
    error: boolean;
  } | null>(null);
  const normalizedQuery = query.trim();
  const currentResponse =
    searchResponse?.query === normalizedQuery ? searchResponse : null;
  const results = currentResponse?.results ?? [];
  const loading = open && normalizedQuery.length >= 3 && !currentResponse;
  const error = currentResponse?.error ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(true);

  const closePalette = useCallback((restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
    setQuery("");
    setSearchResponse(null);
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

  useAccessibleDialog({ open, containerRef: dialogRef, initialFocusRef: inputRef, restoreFocusRef, onClose: closePalette });

  useEffect(() => {
    if (!open || normalizedQuery.length < 3) {
      return;
    }

    return startDebouncedRequest(
      (signal) => searchGlobally(normalizedQuery, signal),
      (data) => {
        setSearchResponse({
          query: normalizedQuery,
          results: flattenGlobalSearch(data),
          error: false,
        });
      },
      () => {
        setSearchResponse({ query: normalizedQuery, results: [], error: true });
      },
      300,
    );
  }, [open, normalizedQuery]);

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
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-1 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600/25"
            placeholder="Buscar trabajo, casos, personas o propuestas..."
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

        {query && query.trim().length < 3 && (
          <div className="p-6 text-center text-sm text-slate-500">
            Escribe al menos 3 caracteres para buscar.
          </div>
        )}

        {error && (
          <div className="p-4 flex items-center gap-2 text-red-600 bg-red-50">
            <AlertCircle size={16} />
            <span className="text-sm font-medium">
              Error al buscar. Intente de nuevo.
            </span>
          </div>
        )}

        {query.trim().length >= 3 &&
          results.length === 0 &&
          !loading &&
          !error && (
            <div className="min-w-0 overflow-y-auto break-words p-6 text-center text-sm text-slate-500 [overflow-wrap:anywhere]">
              No se encontraron resultados para &quot;{query}&quot;
            </div>
          )}

        {Object.entries(grouped).length > 0 && (
          <div className="min-h-0 overflow-y-auto overscroll-contain p-2">
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
    </div>
  );
}
