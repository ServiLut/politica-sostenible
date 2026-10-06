"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Layers3, MapPin, ZoomIn, ZoomOut } from "lucide-react";
import { projectTerritoryHeatmapItems, type TerritoryHeatmapItem } from "@/lib/territory-heatmap";
import { groupTerritoryMarkers } from "@/lib/territory-map-markers";

export function TerritoryPageMap({ items, onSelect }: { items: TerritoryHeatmapItem[]; onSelect(item: TerritoryHeatmapItem): void }) {
  const projection = useMemo(() => projectTerritoryHeatmapItems(items), [items]);
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 320 });
  const [zoom, setZoom] = useState(1);
  const [groupIds, setGroupIds] = useState<string[] | null>(null);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const markers = useMemo(() => groupTerritoryMarkers(projection.points, size.width * zoom, size.height * zoom), [projection, size, zoom]);
  const selectedGroup = groupIds ? items.filter(item => groupIds.includes(item.id)) : [];
  const changeZoom = (next: number) => {
    setZoom(next);
    setGroupIds(null);
    viewport.current?.scrollTo({ left: 0, top: 0 });
  };
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">Ubicación de esta página</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">{items.length} {items.length === 1 ? "lugar" : "lugares"}. Cada círculo muestra la cifra del lugar. El signo «&lt;» significa «menos de»; el icono de capas agrupa lugares cercanos.</p>
      </div>
      <div role="group" aria-label="Ampliación del mapa" className="flex max-w-full flex-wrap items-center gap-1">
        <button type="button" aria-label="Reducir mapa" disabled={zoom === 1} onClick={() => changeZoom(zoom / 2)} className="flex h-11 w-11 items-center justify-center rounded-lg border bg-white disabled:opacity-40"><ZoomOut size={18} /></button>
        <output className="min-w-14 text-center text-xs" aria-label="Nivel de ampliación">{zoom * 100}%</output>
        <button type="button" aria-label="Ampliar mapa" disabled={zoom === 4} onClick={() => changeZoom(zoom * 2)} className="flex h-11 w-11 items-center justify-center rounded-lg border bg-white disabled:opacity-40"><ZoomIn size={18} /></button>
        {zoom > 1 && <button type="button" onClick={() => changeZoom(1)} className="min-h-11 px-3 text-xs font-semibold text-blue-700">Restablecer</button>}
      </div>
    </div>
    <div ref={viewport} role="region" tabIndex={0} aria-label="Ubicación geográfica de los lugares de esta página" className="relative h-80 overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600">
      {projection.points.length ? <div className="relative" style={{ width: `${zoom * 100}%`, height: size.height * zoom }}>
        {projection.scope === "COLOMBIA" && <div aria-hidden="true" className="absolute inset-0 bg-[url('/maps/colombia-dane-mgn-2025.svg')] bg-[length:100%_100%] bg-no-repeat" />}
        {markers.map(marker => {
          const first = marker.items[0];
          const grouped = marker.items.length > 1;
          const reservedLimit = /^Menos de\s+(\d+)$/i.exec(first.displayValue.trim());
          const shortValue = first.suppressed ? reservedLimit ? `<${reservedLimit[1]}` : "R" : first.value === null ? "—" : `${new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(first.value)}${first.displayValue.includes("%") ? "%" : ""}`;
          return <button key={first.id} type="button" title={grouped ? `${marker.items.length} lugares agrupados` : `${first.name}: ${first.displayValue}`} aria-label={grouped ? `Ver ${marker.items.length} lugares agrupados` : `${first.name}: ${first.displayValue}. Ver detalle`} onClick={() => grouped ? setGroupIds(marker.items.map(item => item.id)) : onSelect(first)} style={{ left: `${marker.x}%`, top: `${marker.y}%` }} className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center border-2 text-xs font-bold shadow-sm focus-visible:z-20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${grouped ? "rounded-xl border-slate-500 bg-white text-slate-800" : first.value === 0 || first.value === null ? "rounded-full border-slate-300 bg-white text-slate-600" : "rounded-full border-blue-700 bg-blue-700 text-white"}`}>
            {grouped ? <><Layers3 size={12} aria-hidden="true" /><span>{marker.items.length}</span></> : shortValue}
          </button>;
        })}
      </div> : <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"><MapPin size={24} className="text-slate-400" /><p className="text-sm text-slate-600">Estos lugares todavía no tienen una ubicación disponible. Puedes consultarlos en la lista.</p></div>}
    </div>
    {selectedGroup.length > 0 && <div role="region" aria-label="Lugares del grupo seleccionado" className="border-t bg-white p-4">
      <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{selectedGroup.length} {selectedGroup.length === 1 ? "lugar cercano" : "lugares cercanos"}</p><button type="button" onClick={() => setGroupIds(null)} className="min-h-11 px-3 text-sm text-slate-600">Cerrar grupo</button></div>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">{selectedGroup.map(item => <li key={item.id}><button type="button" onClick={() => onSelect(item)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-blue-50"><span className="min-w-0 break-words">{item.name}</span><strong className="shrink-0">{item.displayValue}</strong></button></li>)}</ul>
    </div>}
    <p className="border-t p-3 text-xs leading-5 text-slate-500">{projection.scope === "COLOMBIA" ? "Referencia cartográfica: DANE 2025. " : "Posiciones relativas de los lugares de esta página. "}La ubicación administrativa no es una dirección de personas ni un puesto de votación. {projection.missingCoordinates > 0 ? `${projection.missingCoordinates} ${projection.missingCoordinates === 1 ? "lugar sin coordenadas sigue disponible" : "lugares sin coordenadas siguen disponibles"} en la lista.` : ""}</p>
  </div>;
}
