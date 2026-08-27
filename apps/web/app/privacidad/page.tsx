import Link from "next/link";
import { ArrowLeft, Database, ShieldCheck } from "lucide-react";

const sections = [
  {
    title: "Responsables y finalidades",
    body: "Cada campaña u organización que recolecta información es responsable de indicar su identidad, canales de atención y finalidades concretas. Política Sostenible opera como plataforma encargada y no reutiliza información entre clientes.",
  },
  {
    title: "Datos sensibles",
    body: "La orientación política y la información que permita inferirla son datos sensibles. Su entrega es facultativa y sólo puede tratarse con autorización previa, explícita e informada o con otra base jurídica documentada que resulte aplicable.",
  },
  {
    title: "Campaña y ejercicio del cargo",
    body: "Los datos de simpatizantes, voluntariado y operación electoral permanecen separados de los datos de atención ciudadana, PQRS y gestión pública. No existe migración automática entre ambas finalidades.",
  },
  {
    title: "Derechos de las personas",
    body: "Puedes conocer, actualizar, rectificar y solicitar prueba de la autorización; también revocar el consentimiento o pedir la supresión cuando proceda. Cada formulario debe mostrar el canal del responsable para ejercer estos derechos sin fricción.",
  },
  {
    title: "Seguridad y conservación",
    body: "La plataforma aplica aislamiento por organización, permisos mínimos, trazabilidad y almacenamiento privado. Cada responsable define periodos de retención y debe eliminar o anonimizar información cuando la finalidad termine.",
  },
  {
    title: "Comunicaciones",
    body: "Una autorización debe identificar los canales permitidos. La plataforma registra revocaciones y no realiza envíos; cualquier integración futura deberá excluirlas antes de usar WhatsApp, SMS o correo. No se autoriza agregar personas sin consentimiento a grupos o listas masivas.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 md:py-16">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={16} /> Volver
        </Link>
        <header className="mt-8 rounded-[2rem] bg-slate-950 p-8 text-white md:p-12">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
            <ShieldCheck />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
            Aviso marco · versión 2026.1
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
            Privacidad electoral por diseño
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300">
            Este aviso explica las reglas mínimas de la plataforma. Antes de
            recolectar datos, cada organización debe publicar su aviso
            específico con identidad, finalidad, vigencia y canales de atención.
          </p>
        </header>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-sm"
            >
              <Database className="mb-4 text-emerald-700" size={20} />
              <h2 className="text-lg font-black">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <aside className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          Este documento no reemplaza el aviso de privacidad de cada campaña ni
          la revisión jurídica de sus tratamientos. La activación productiva
          debe bloquearse hasta configurar al responsable y su canal de
          derechos.
        </aside>
      </div>
    </main>
  );
}
