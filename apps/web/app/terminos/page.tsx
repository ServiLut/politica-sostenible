import Link from "next/link";
import { ArrowLeft, Ban, CheckCircle2, Scale } from "lucide-react";

const allowed = [
  "Gestionar equipos, territorio, agenda, finanzas y operación electoral lícita.",
  "Registrar consentimientos, evidencias, decisiones y aprobaciones humanas.",
  "Preparar información para reportes oficiales sin suplantar a la autoridad electoral.",
  "Gestionar atención ciudadana en un modo y almacén separados de la campaña.",
];

const prohibited = [
  "Importar, comprar o reutilizar bases sin una finalidad y base jurídica verificables.",
  "Inferir orientación política individual de fuentes opacas o entrenar modelos entre campañas.",
  "Presentar conteos privados, análisis automatizados o contenido generado como resultado oficial.",
  "Mezclar recursos, funcionarios, canales o datos del ejercicio del cargo con proselitismo.",
  "Publicar propaganda, encuestas o mensajes sin revisión humana y cumplimiento aplicable.",
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 md:py-16">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={16} /> Volver
        </Link>
        <header className="mt-8 rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-slate-200 md:p-12">
          <Scale className="mb-6 text-blue-700" size={34} />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">
            Condiciones marco · versión 2026.1
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
            Uso responsable de la plataforma
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600">
            Política Sostenible es una herramienta de gestión. La campaña
            conserva la responsabilidad sobre la licitud de sus datos,
            decisiones, contenidos, financiación y reportes oficiales.
          </p>
        </header>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50/60 p-7">
            <h2 className="text-xl font-black text-emerald-950">
              Usos permitidos
            </h2>
            <ul className="mt-5 space-y-4">
              {allowed.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm leading-6 text-emerald-900"
                >
                  <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-[1.75rem] border border-red-200 bg-red-50/60 p-7">
            <h2 className="text-xl font-black text-red-950">Usos prohibidos</h2>
            <ul className="mt-5 space-y-4">
              {prohibited.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm leading-6 text-red-900"
                >
                  <Ban className="mt-0.5 shrink-0" size={18} />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-8 space-y-4 rounded-[1.75rem] border border-slate-200 bg-white p-7 text-sm leading-7 text-slate-600">
          <h2 className="text-xl font-black text-slate-950">
            Disponibilidad, exportación y cierre
          </h2>
          <p>
            La organización debe poder exportar su información y definir su
            retención. El cierre de una cuenta no autoriza a conservar datos
            indefinidamente ni a moverlos a otro tenant.
          </p>
          <p>
            Las integraciones, reglas legales y límites configurados son ayudas
            de control; no sustituyen la validación de contador, auditor,
            abogado, autoridad electoral o servidor competente.
          </p>
        </section>
      </div>
    </main>
  );
}
