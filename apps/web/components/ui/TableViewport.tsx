"use client";

import { ArrowLeft, ArrowRight, Columns3 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./utils";

/** Keep every column reachable without making the page itself scroll sideways. */
export function TableViewport({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ overflow: false, start: true, end: true });
  const measure = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const next = {
      overflow: element.scrollWidth > element.clientWidth + 2,
      start: element.scrollLeft <= 2,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
    };
    setPosition((previous) =>
      previous.overflow === next.overflow && previous.start === next.start && previous.end === next.end
        ? previous
        : next,
    );
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [measure, children]);

  function scroll(direction: -1 | 1) {
    const element = viewport.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(160, element.clientWidth * 0.75),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <div className={cn("min-w-0 max-w-full", className)}>
      {position.overflow && (
        <div className="flex min-w-0 items-center justify-between gap-3 rounded-t-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p id={`${id}-hint`} className="flex min-w-0 items-start gap-2 leading-5">
            <Columns3 aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-blue-700" />
            <span>Hay más columnas. Desliza la tabla o usa las flechas.</span>
          </p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label={`Ver columnas anteriores: ${label}`}
              aria-controls={id}
              disabled={position.start}
              onClick={() => scroll(-1)}
              className="inline-flex size-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-800 hover:bg-blue-50 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Ver columnas siguientes: ${label}`}
              aria-controls={id}
              disabled={position.end}
              onClick={() => scroll(1)}
              className="inline-flex size-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-800 hover:bg-blue-50 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <div
        ref={viewport}
        id={id}
        role="region"
        aria-label={`${label}: tabla con desplazamiento horizontal`}
        aria-describedby={position.overflow ? `${id}-hint` : undefined}
        tabIndex={0}
        onScroll={measure}
        className="data-table-viewport min-w-0 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      >
        {children}
      </div>
    </div>
  );
}
