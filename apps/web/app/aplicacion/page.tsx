import Link from "next/link";
import { ArrowRight, CloudOff, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Abrir aplicación | Política Sostenible",
  description:
    "Punto de entrada público y seguro para la aplicación instalable.",
};

export default function ApplicationLauncherPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12 text-white">
      <section className="w-full max-w-xl rounded-[2rem] border border-slate-700 bg-slate-900 p-7 shadow-2xl sm:p-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
          <ShieldCheck aria-hidden="true" size={30} />
        </div>

        <p className="mt-7 text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
          Aplicación verificable
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          Política Sostenible
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Este acceso no contiene datos de campaña ni información personal. Con
          conexión, ingresa para consultar los módulos autorizados para tu
          organización.
        </p>

        <div className="mt-7 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
          <div className="flex items-start gap-3">
            <CloudOff
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-amber-300"
              size={20}
            />
            <div>
              <h2 className="text-sm font-black text-amber-100">
                Alcance actual sin conexión
              </h2>
              <p className="mt-1 text-xs leading-5 text-amber-100/80">
                Puedes abrir la bóveda desde este punto de entrada y capturar
                votantes si la misma identidad provisionó antes, con conexión,
                su contexto territorial cifrado. La clave solo vive en memoria y
                cada captura queda pendiente hasta una sincronización manual con
                recibo de la API. Confirmado ese recibo, la copia local se
                elimina.
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-100/80">
                Las actas E-14 pueden prepararse sin conexión únicamente si la
                misma identidad provisionó antes, en línea, una capacidad para
                su rol, alcance territorial, etapa y ventana electoral. La
                evidencia queda cifrada en este dispositivo. La URL de subida,
                el envío directo, la confirmación y el recibo durable de la API
                requieren reconexión: guardar sin conexión nunca significa que
                el servidor haya recibido el acta ni que el resultado sea
                oficial.
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-100/80">
                También puedes listar y abrir desde la bóveda los mapas de calor
                agregados que guardaste antes de forma explícita. Cada vista
                muestra su corte del servidor y se rotula como copia offline
                posiblemente desactualizada; abrirla no consulta la red.
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-100/80">
                La bóveda también permite preparar incidentes operativos de
                campaña, sin archivos y con datos personales mínimos, cuando el
                rol y territorio fueron provisionados previamente. Al volver la
                conexión, la API revalida identidad, organización, etapa y
                territorio; un rechazo conserva el pendiente para revisión.
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-100/80">
                Puedes guardar de forma explícita una copia cifrada de la
                versión ACTIVE del calendario, con release, SHA-256, corte y
                zonas horarias. Es estrictamente de solo lectura: no reemplaza
                la versión viva ni afirma que sus alertas estén sincronizadas.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/iniciar-sesion?origen=pwa"
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Ingresar de forma segura
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-slate-600 px-5 text-sm font-black text-slate-200 transition hover:border-slate-400 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Ver información pública
          </Link>
        </div>
      </section>
    </main>
  );
}
