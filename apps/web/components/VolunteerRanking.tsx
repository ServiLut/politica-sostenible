import { ShieldCheck } from "lucide-react";

/**
 * Compatibilidad temporal para vistas heredadas. La plataforma no clasifica
 * personas por capturar ciudadanos ni concede incentivos por volumen de datos.
 */
export function VolunteerRanking() {
  return (
    <section className="h-full rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-center gap-3 text-emerald-900">
        <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        <h3 className="text-lg font-black">Colaboración responsable</h3>
      </div>
      <p className="mt-4 text-sm leading-6 text-emerald-900/80">
        Los aportes del equipo se gestionan con tareas, responsables y
        trazabilidad. No se crean rankings ni recompensas por registrar datos
        personales o inferir afinidad política.
      </p>
    </section>
  );
}
