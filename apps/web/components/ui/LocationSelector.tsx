"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MapPin, ChevronDown, X, Globe } from 'lucide-react';
import { MEDELLIN_LOCATIONS } from '../../data/medellin-locations';
import { cn } from './utils';

interface LocationSelectorProps {
  value: string;
  onChange: (value: string) => void;
  onManualSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  value,
  onChange,
  onManualSubmit,
  placeholder = "Seleccionar o escribir ubicación...",
  className,
  required
}) => {
  const [isOpen, setIsOpen] = useState(false);
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
    const query = value.toLowerCase().trim();
    if (!query) return MEDELLIN_LOCATIONS;
    return MEDELLIN_LOCATIONS.filter(option => 
      option.name.toLowerCase().includes(query) ||
      option.municipio.toLowerCase().includes(query) ||
      option.comuna.toLowerCase().includes(query)
    );
  }, [value]);

  const handleSelect = (optionName: string) => {
    onChange(optionName);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (onManualSubmit) {
        e.preventDefault();
        onManualSubmit(value);
      }
      setIsOpen(false);
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <div 
        className={cn(
          "w-full flex items-center gap-3 px-5 py-3 border-2 rounded-2xl bg-zinc-50/50 transition-all cursor-text focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-500 focus-within:bg-white",
          isOpen ? "border-blue-500 bg-white ring-4 ring-blue-500/10" : "border-zinc-100"
        )}
      >
        <MapPin size={18} className={cn("transition-colors", isOpen ? "text-blue-500" : (value ? "text-slate-900" : "text-slate-400"))} />
        <input
          type="text"
          required={required}
          className="flex-1 bg-transparent border-none outline-none text-sm font-black text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay closing slightly to allow click on options
            setTimeout(() => setIsOpen(false), 200);
          }}
        />
        {value && (
          <button 
            type="button" 
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="text-slate-400 hover:text-red-500 transition-colors"
          >
            <X size={16} />
          </button>
        )}
        <button 
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ChevronDown 
            size={18} 
            className={cn("text-slate-400 transition-transform duration-300", isOpen && "rotate-180 text-blue-500")} 
          />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[2rem] border border-slate-100 shadow-2xl z-[100] max-h-[300px] overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="overflow-y-auto flex-1 p-2 scrollbar-thin">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = value === option.name;
                
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={cn(
                      "w-full text-left px-5 py-3.5 rounded-xl text-sm transition-all flex items-center justify-between group mb-1 last:mb-0",
                      isSelected 
                        ? "bg-blue-50 text-blue-700 border border-blue-100" 
                        : "text-slate-600 hover:bg-slate-50 hover:text-blue-600 border border-transparent"
                    )}
                    onMouseDown={(e) => {
                      // Use onMouseDown to prevent onBlur from closing before click
                      e.preventDefault();
                      handleSelect(option.name);
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-black text-slate-900 group-hover:text-blue-700 transition-colors">
                        {option.municipio}
                      </span>
                      <span className="text-slate-400 font-medium">
                        - {option.comuna}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                    )}
                  </button>
                );
              })
            ) : value.trim().length > 0 && (
              <div className="px-5 py-6 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-blue-600 font-black text-sm">
                  <Globe size={16} />
                  Búsqueda Libre
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  Se utilizará la dirección: <span className="text-slate-600 font-bold italic">"{value}"</span>
                </p>
                {onManualSubmit && (
                  <button 
                    type="button"
                    className="mt-3 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onManualSubmit(value);
                      setIsOpen(false);
                    }}
                  >
                    Validar en Mapa
                  </button>
                )}
              </div>
            )}
            
            {filteredOptions.length === 0 && value.trim().length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-bold text-slate-400">Escribe una dirección o elige una comuna</p>
              </div>
            )}
          </div>
        </div>
      )}
      
      <style jsx global>{`
        .scrollbar-thin::-webkit-scrollbar {
          width: 5px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};
