"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
}

interface UserComboboxProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  name?: string;
  fetchItems: (search: string, signal: AbortSignal) => Promise<ComboboxPaginationResult>;
}

export function UserCombobox({ value, onChange, className, name, fetchItems }: UserComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ComboboxUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ComboboxUser | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && !selectedUser && !items.find(i => i.id === value)) {
      // In a real app we might fetch the specific user, but for now we rely on the list
    }
  }, [value, selectedUser, items]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    
    setLoading(true);
    const timeout = setTimeout(() => {
      const controller = new AbortController();
      fetchItems(search, controller.signal)
        .then((res) => setItems(res.items))
        .catch(() => {})
        .finally(() => setLoading(false));

      return () => controller.abort();
    }, 400); // 400ms debounce

    return () => clearTimeout(timeout);
  }, [search, open, fetchItems]);

  const displayValue = selectedUser?.name || items.find(i => i.id === value)?.name || (value ? "Seleccionado" : "Por asignar");

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 min-h-12 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      >
        <span className="truncate">{displayValue}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
          <div className="flex items-center border-b border-slate-100 px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
            <input
              autoFocus
              className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-400"
              placeholder="Buscar usuario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {items.length === 0 && !loading && (
              <div className="py-6 text-center text-sm text-slate-500">No se encontraron usuarios.</div>
            )}
            
            <button
              type="button"
              className={cn(
                "relative flex w-full cursor-default select-none items-center rounded-xl px-2 py-2.5 text-sm outline-none hover:bg-slate-100 focus:bg-slate-100",
                value === "" && "bg-slate-50"
              )}
              onClick={() => {
                onChange("");
                setSelectedUser(null);
                setOpen(false);
              }}
            >
              <Check className={cn("mr-2 h-4 w-4", value === "" ? "opacity-100" : "opacity-0")} />
              <span>Por asignar</span>
            </button>

            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-xl px-2 py-2.5 text-sm outline-none hover:bg-slate-100 focus:bg-slate-100",
                  value === item.id && "bg-slate-50"
                )}
                onClick={() => {
                  onChange(item.id);
                  setSelectedUser(item);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{item.name}</span>
                <span className="ml-auto text-xs text-slate-400">{item.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
