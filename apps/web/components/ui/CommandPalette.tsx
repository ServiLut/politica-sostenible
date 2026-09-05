"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import Link from "next/link";

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  category: "Voters" | "Users" | "Proposals" | "Documents";
  href: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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
    }
  }, [open]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // Fallback mockup in case API doesn't exist
        const data = await apiRequest(`/search?q=${encodeURIComponent(query)}`).catch(() => []) as SearchResult[];
        setResults(data);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (!open) return null;

  const grouped = results.reduce((acc, result) => {
    acc[result.category] = acc[result.category] || [];
    acc[result.category].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/50 p-4">
      <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center px-4 py-3 border-b border-slate-200">
          <Search className="text-slate-400 mr-3" size={20} />
          <input
            ref={inputRef}
            className="flex-1 outline-none text-lg bg-transparent"
            placeholder="Buscar..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && <Loader2 className="animate-spin text-slate-400" size={20} />}
        </div>
        
        {query && results.length === 0 && !loading && (
          <div className="p-8 text-center text-slate-500">
            No se encontraron resultados para "{query}"
          </div>
        )}

        {Object.entries(grouped).length > 0 && (
          <div className="max-h-96 overflow-y-auto p-2">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="mb-4">
                <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {category}
                </div>
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="font-medium text-slate-900">{item.title}</div>
                    {item.subtitle && <div className="text-sm text-slate-500">{item.subtitle}</div>}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
