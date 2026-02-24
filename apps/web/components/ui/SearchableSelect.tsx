"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';
import { cn } from './utils';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = "Seleccionar...",
  className,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const query = search.toLowerCase().trim();
    
    // Normalizar para búsqueda sin tildes
    const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const normalizedQuery = normalize(query);

    const allFiltered = options.filter(option => 
      normalize(option).includes(normalizedQuery)
    );

    // Si no hay búsqueda, mostramos los 5 principales (primeros 5 de la lista original)
    // Pero si hay búsqueda, mostramos todos los que coincidan
    if (!query) {
      return {
        display: options.slice(0, 5),
        hasMore: options.length > 5
      };
    }

    return {
      display: allFiltered,
      hasMore: false
    };
  }, [options, search]);

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl text-[11px] font-black cursor-pointer transition-all",
          isOpen ? "border-teal-500 bg-white shadow-lg" : "hover:bg-slate-100",
          disabled && "opacity-50 cursor-not-allowed",
          value ? "text-slate-900" : "text-slate-400"
        )}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="truncate">{value || placeholder}</span>
        </div>
        <div className="flex items-center gap-1">
          {value && !disabled && (
            <button 
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="p-1 hover:text-rose-500 transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border-2 border-slate-100 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                autoFocus
                type="text"
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-[11px] font-bold outline-none focus:bg-white transition-all"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="max-h-[250px] overflow-y-auto p-1 custom-scrollbar">
            {filteredOptions.display.map((option) => (
              <div
                key={option}
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tight cursor-pointer transition-all mb-0.5 last:mb-0",
                  value === option 
                    ? "bg-teal-50 text-teal-700" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-teal-600"
                )}
                onClick={() => handleSelect(option)}
              >
                <span className="truncate">{option}</span>
                {value === option && <Check size={12} />}
              </div>
            ))}

            {filteredOptions.hasMore && (
              <div className="px-4 py-2 text-[9px] font-bold text-slate-400 italic text-center border-t border-slate-50 mt-1">
                Escribe para buscar más opciones...
              </div>
            )}

            {filteredOptions.display.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-400">
                <p className="text-[10px] font-bold">No se encontraron resultados</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
