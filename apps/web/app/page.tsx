import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Eye,
  FileCheck2,
  Fingerprint,
  Flag,
  Landmark,
  Layers3,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  Network,
  ReceiptText,
  Scale,
  ShieldCheck,
  UsersRound,
  Vote,
} from "lucide-react";
import { LandingAuthCta } from "@/components/landing/LandingAuthCta";

const journey = [
  {
    number: "01",
    title: "Escuchar",
    description:
      "Registra solicitudes y aportes con una finalidad clara, su fuente y el contexto necesario para responder.",
    icon: MessageSquareText,
  },
  {
    number: "02",
    title: "Organizar",
    description:
      "Conecta equipo, territorio, responsables, agenda y prioridades sin perder el alcance de cada rol.",
    icon: Network,
  },
  {
    number: "03",
    title: "Movilizar",
    description:
      "Convierte relaciones autorizadas en tareas, eventos y trabajo territorial con seguimiento verificable.",
    icon: MapPin,
  },
  {
    number: "04",
    title: "Cumplir",
    description:
      "Documenta decisiones, movimientos financieros, soportes e incidentes antes de que venza el control.",
    icon: ClipboardCheck,
  },
  {
    number: "05",
    title: "Rendir cuentas",
    description:
      "Da seguimiento a casos y compromisos con responsables, fechas, progreso y evidencia de resultado.",
    icon: Eye,
  },
];

const capabilities = [
  {
    title: "Territorio coordinado",
    description:
      "Organiza zonas, responsables y relacionamiento sin convertir una base de datos en una lista sin contexto.",
    icon: MapPin,
    accent: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  {
    title: "Equipo con alcance claro",
    description:
      "Asigna responsabilidades y limita cada acceso según organización, modo de operación y rol vigente.",
    icon: UsersRound,
    accent: "bg-sky-50 text-sky-700 ring-sky-100",
  },
  {
    title: "Finanzas con soporte",
    description:
      "Conserva el origen de ingresos y gastos, sus aprobaciones y documentos para preparar la revisión oficial.",
    icon: ReceiptText,
    accent: "bg-amber-50 text-amber-700 ring-amber-100",
  },
  {
    title: "Control electoral documentado",
    description:
      "Coordina testigos, mesas, incidentes y reportes E-14 privados sin presentarlos como resultado oficial.",
    icon: Vote,
    accent: "bg-violet-50 text-violet-700 ring-violet-100",
  },
  {
    title: "Atención ciudadana",
    description:
      "Gestiona casos, responsables y tiempos de respuesta en un espacio separado de los datos de campaña.",
    icon: Landmark,
    accent: "bg-rose-50 text-rose-700 ring-rose-100",
  },
  {
    title: "Evidencia auditable",
    description:
      "Registra quién hizo qué, cuándo y bajo qué alcance para revisar hechos, no reconstruirlos desde chats.",
    icon: FileCheck2,
    accent: "bg-slate-100 text-slate-700 ring-slate-200",
  },
];

const campaignFeatures = [
  "Relacionamiento consentido",
  "Territorio, tareas y agenda",
  "Finanzas y soportes",
  "Testigos, incidentes y E-14",
];

const publicOfficeFeatures = [
  "Casos y tiempos de respuesta",
  "Compromisos con responsable",
  "Agenda de gestión",
  "Seguimiento de avances",
];

const operatingPrinciples = [
  {
    title: "Finalidad antes que volumen",
    description:
      "Cada relación necesita un propósito documentado. Importar más contactos no reemplaza la autorización ni la procedencia.",
    icon: Fingerprint,
  },
  {
    title: "Control antes que automatización",
    description:
      "Permisos, revisión humana y trazabilidad acompañan las decisiones sensibles y las comunicaciones.",
    icon: ShieldCheck,
  },
  {
    title: "Evidencia antes que predicción",
    description:
      "La plataforma registra trabajo realizado. No infiere intención de voto ni promete resultados electorales.",
    icon: BadgeCheck,
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f7f2] text-slate-950 selection:bg-emerald-200 selection:text-emerald-950">
      <section className="relative isolate border-b border-slate-900/10 bg-[#0b1f1c] text-white">
        <div
          className="absolute inset-0 -z-20 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 16% 12%, rgba(52, 211, 153, 0.28), transparent 30%), radial-gradient(circle at 85% 38%, rgba(251, 191, 36, 0.18), transparent 27%)",
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 -z-10 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
          aria-hidden="true"
        />

        <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="group inline-flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1f1c]"
            aria-label="Política Sostenible, inicio"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-colors group-hover:bg-white/15">
              <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-[-0.01em]">
                Política Sostenible
              </span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100/60 sm:block">
                Operación verificable
              </span>
            </span>
          </Link>

          <nav
            aria-label="Navegación principal"
            className="hidden items-center gap-7 text-sm font-medium text-white/70 md:flex"
          >
            <a className="transition-colors hover:text-white" href="#recorrido">
              Cómo funciona
            </a>
            <a className="transition-colors hover:text-white" href="#capacidades">
              Capacidades
            </a>
            <a className="transition-colors hover:text-white" href="#confianza">
              Confianza
            </a>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="hidden text-sm font-bold text-white/80 transition hover:text-white sm:block">
              Iniciar sesión
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              Registrarse
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-20 lg:px-10 lg:pb-32">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-200/15 bg-emerald-300/10 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200">
              <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
              Infraestructura cívica hecha para Colombia
            </div>

            <h1 className="text-5xl font-black tracking-[-0.06em] text-white sm:text-6xl lg:text-7xl">
              Política Sostenible
            </h1>
            <p className="mt-6 max-w-2xl text-2xl font-semibold leading-[1.18] tracking-[-0.035em] text-white/95 sm:text-3xl lg:text-[2.55rem]">
              Del territorio a la rendición de cuentas, sin perder el control.
            </p>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Coordina equipo, ciudadanía, finanzas, control electoral y
              compromisos con responsables, finalidad y evidencia en cada paso.
            </p>

            <div id="comenzar" className="mt-9 scroll-mt-8">
              <LandingAuthCta />
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-white/60">
              <span className="inline-flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                Sin perfiles políticos inferidos
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                Sin promesas de resultado electoral
              </span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:mx-0 lg:ml-auto">
            <div
              className="absolute -inset-12 -z-10 rounded-full bg-emerald-300/10 blur-3xl"
              aria-hidden="true"
            />
            <div className="overflow-hidden rounded-[2rem] border border-white/15 bg-[#102b27]/90 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-4">
              <div className="rounded-[1.45rem] border border-white/10 bg-[#f8faf7] p-5 text-slate-950 sm:p-7">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                      Centro operativo
                    </p>
                    <h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em]">
                      Trabajo que deja rastro
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Campaña
                  </span>
                </div>

                <div className="mt-6 space-y-3">
                  {[
                    {
                      label: "Relacionamiento",
                      detail: "Autorización y finalidad registradas",
                      icon: Fingerprint,
                    },
                    {
                      label: "Territorio",
                      detail: "Responsable y vencimiento definidos",
                      icon: MapPin,
                    },
                    {
                      label: "Finanzas",
                      detail: "Movimiento enlazado a su soporte",
                      icon: ReceiptText,
                    },
                    {
                      label: "Control electoral",
                      detail: "Reporte privado con procedencia",
                      icon: Vote,
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.label}
                        className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
                          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold">{item.label}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {item.detail}
                          </span>
                        </span>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#eef3ec] px-4 py-3 text-xs font-medium leading-5 text-slate-600">
                  <LockKeyhole
                    className="h-4 w-4 shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  Cada registro conserva organización, responsable, momento y
                  alcance de acceso.
                </div>
              </div>
            </div>

            <div className="absolute -bottom-5 -left-3 hidden max-w-[13rem] items-center gap-3 rounded-2xl border border-white/50 bg-white px-4 py-3 text-slate-950 shadow-xl sm:flex lg:-left-10">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                <Scale className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-xs font-bold leading-4">
                Preparado para revisión, no para improvisación
              </span>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Principios esenciales" className="border-b border-slate-900/10 bg-white">
        <div className="mx-auto grid max-w-7xl divide-y divide-slate-200 px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-10">
          <div className="flex items-center gap-3 py-5 md:pr-8">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-800">
              Campaña y ejercicio del cargo separados
            </p>
          </div>
          <div className="flex items-center gap-3 py-5 md:px-8">
            <Layers3 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-800">Datos aislados por organización</p>
          </div>
          <div className="flex items-center gap-3 py-5 md:pl-8">
            <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-800">Decisiones respaldadas por registros</p>
          </div>
        </div>
      </section>

      <section id="recorrido" className="scroll-mt-8 px-5 py-24 sm:px-8 sm:py-32 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                Un recorrido completo
              </p>
              <h2 className="mt-4 max-w-lg text-4xl font-black tracking-[-0.05em] text-slate-950 sm:text-5xl">
                De escuchar a demostrar.
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-slate-600 lg:justify-self-end">
              La confianza no aparece en una base de datos. Se construye cuando
              cada conversación se convierte en trabajo responsable y cada
              compromiso puede mostrar su avance.
            </p>
          </div>

          <ol className="mt-14 grid overflow-hidden rounded-[2rem] border border-slate-900/10 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.07)] md:grid-cols-5">
            {journey.map((step, index) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className="relative border-b border-slate-200 p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 lg:p-7"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black tracking-[0.18em] text-slate-400">
                      {step.number}
                    </span>
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#edf4ef] text-emerald-800">
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-8 text-xl font-black tracking-[-0.03em]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{step.description}</p>
                  {index < journey.length - 1 ? (
                    <ChevronRight
                      className="absolute -right-3 top-9 z-10 hidden h-6 w-6 rounded-full border border-slate-200 bg-white p-1 text-slate-400 md:block"
                      aria-hidden="true"
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="bg-[#e8eee7] px-5 py-24 sm:px-8 sm:py-32 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-800">
              Dos operaciones. Una disciplina.
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] sm:text-5xl">
              Continuidad sin mezclar finalidades.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Ganar una elección no autoriza a trasladar automáticamente una
              base de campaña al ejercicio del cargo. Por eso cada modo conserva
              su propio alcance, equipo y propósito.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <article className="relative overflow-hidden rounded-[2rem] bg-[#102b27] p-7 text-white shadow-[0_20px_60px_rgba(11,31,28,0.16)] sm:p-9">
              <div className="absolute -right-14 -top-14 h-52 w-52 rounded-full border-[32px] border-emerald-300/10" aria-hidden="true" />
              <div className="relative">
                <div className="flex items-center justify-between gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/10 text-emerald-200">
                    <Flag className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/60">
                    Campaña
                  </span>
                </div>
                <h3 className="mt-8 text-3xl font-black tracking-[-0.04em]">Campaña responsable</h3>
                <p className="mt-3 max-w-md leading-7 text-slate-300">
                  Coordina la operación electoral sin convertir los datos
                  sensibles en un activo sin control.
                </p>
                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {campaignFeatures.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm font-semibold text-white/90">
                      <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </article>

            <article className="relative overflow-hidden rounded-[2rem] border border-slate-900/10 bg-[#fbfaf5] p-7 shadow-[0_20px_60px_rgba(15,23,42,0.07)] sm:p-9">
              <div className="absolute -right-14 -top-14 h-52 w-52 rounded-full border-[32px] border-amber-300/20" aria-hidden="true" />
              <div className="relative">
                <div className="flex items-center justify-between gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-900">
                    <Landmark className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Ejercicio del cargo
                  </span>
                </div>
                <h3 className="mt-8 text-3xl font-black tracking-[-0.04em]">Ejercicio del cargo</h3>
                <p className="mt-3 max-w-md leading-7 text-slate-600">
                  Responde a la ciudadanía y demuestra avances en un contexto
                  separado de la campaña.
                </p>
                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {publicOfficeFeatures.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
                      <Check className="h-4 w-4 text-amber-700" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="capacidades" className="scroll-mt-8 bg-white px-5 py-24 sm:px-8 sm:py-32 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Una operación conectada</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] sm:text-5xl">Menos islas. Más trazabilidad.</h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-slate-600">
              La plataforma une el trabajo que suele quedar disperso entre
              hojas de cálculo, chats, archivos y personas que no comparten la
              misma versión de los hechos.
            </p>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability) => {
              const Icon = capability.icon;
              return (
                <article key={capability.title} className="bg-white p-7 sm:p-8">
                  <span className={`grid h-11 w-11 place-items-center rounded-2xl ring-1 ${capability.accent}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-8 text-xl font-black tracking-[-0.025em]">{capability.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{capability.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="confianza" className="scroll-mt-8 bg-[#f1efe7] px-5 py-24 sm:px-8 sm:py-32 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-800">Confianza por diseño</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] sm:text-5xl">El control también es una función.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              En política, un dato fuera de contexto o una promesa sin evidencia
              no son detalles técnicos. Son riesgos para las personas y para la
              organización.
            </p>

            <div className="mt-9 rounded-3xl border border-slate-900/10 bg-white/70 p-6 backdrop-blur sm:p-7">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
                  <Scale className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-black">Contexto colombiano, sin atajos</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Los flujos toman como referencia reglas y fuentes oficiales,
                    pero la plataforma no reemplaza la responsabilidad jurídica,
                    contable ni el reporte ante las autoridades.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href="https://sedeelectronica.sic.gov.co/comunicado/la-sic-expidio-instrucciones-sobre-proteccion-de-datos-personales-en-el-contexto-electoral"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
                >
                  Circular electoral · SIC
                </a>
                <a
                  href="https://www.cne.gov.co/cuentas-claras"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
                >
                  Cuentas Claras · CNE
                </a>
                <a
                  href="https://www.registraduria.gov.co/Actas-E-14-de-las-mesas-de-votacion-de-las-elecciones-de-Congreso-y-las.html"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
                >
                  Actas E-14 · Registraduría
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {operatingPrinciples.map((principle, index) => {
              const Icon = principle.icon;
              return (
                <article
                  key={principle.title}
                  className="grid gap-5 rounded-3xl border border-slate-900/10 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.05)] sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-7"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f2ec] text-emerald-800">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-black tracking-[-0.025em]">{principle.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{principle.description}</p>
                  </div>
                  <span className="hidden text-xs font-black tracking-[0.16em] text-slate-300 sm:block">0{index + 1}</span>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] bg-[#0b1f1c] px-6 py-12 text-white shadow-[0_28px_80px_rgba(11,31,28,0.2)] sm:px-10 sm:py-16 lg:px-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Una plataforma para hacer el trabajo visible</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.045em] sm:text-5xl">Organice con criterio. Cumpla con evidencia.</h2>
              <p className="mt-5 max-w-2xl leading-7 text-slate-300">
                Empiece creando una organización o ingrese a una operación que
                ya tiene responsables, finalidades y controles definidos.
              </p>
            </div>
            <a
              href="#comenzar"
              className="inline-flex w-fit items-center gap-3 rounded-full bg-emerald-600 px-6 py-3.5 text-sm font-black text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1f1c]"
            >
              Ver opciones de acceso
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-900/10 bg-[#f6f7f2] px-5 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0b1f1c] text-emerald-300">
              <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-black">Política Sostenible</p>
              <p className="mt-0.5 text-xs text-slate-500">Operación política responsable en Colombia</p>
            </div>
          </div>

          <nav aria-label="Información legal" className="flex items-center gap-6 text-sm font-bold text-slate-600">
            <Link className="transition hover:text-emerald-800" href="/privacidad">Privacidad</Link>
            <Link className="transition hover:text-emerald-800" href="/terminos">Términos</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
