"use client";

import { useEffect, useState, useRef } from "react";
import { Search, Loader2, AlertCircle } from "lucide-react";
import {
  flattenGlobalSearch,
  GlobalSearchResult,
  searchGlobally,
} from "@/lib/search-api";

const CATEGORY_LABELS: Record<string, string> = {
  Voters: "Personas",
  Users: "Equipo",
  Proposals: "Propuestas",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
      setError(false);
    }
  }, [open]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) {
      setResults([]);
      setError(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await searchGlobally(normalizedQuery, controller.signal);
        setResults(flattenGlobalSearch(data));
      } catch (requestError: unknown) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        setError(true);
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-32"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-slate-200">
          <Search
            aria-hidden="true"
            className="mr-3 text-slate-400"
            size={20}
          />
          <input
            ref={inputRef}
            type="search"
            aria-label="Buscar en la organización"
            className="flex-1 bg-transparent text-lg outline-none"
            placeholder="Buscar personas, equipo o propuestas..."
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
            <div className="p-8 text-center text-slate-500">
              No se encontraron resultados para &quot;{query}&quot;
            </div>
          )}

        {Object.entries(grouped).length > 0 && (
          <div className="max-h-96 overflow-y-auto p-2">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="mb-4">
                <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {CATEGORY_LABELS[category] ?? category}
                </div>
                {items.map((item) => (
                  <a
                    key={`${item.category}:${item.id}`}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="font-medium text-slate-900">
                      {item.title}
                    </div>
                    {item.subtitle && (
                      <div className="text-sm text-slate-500">
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
