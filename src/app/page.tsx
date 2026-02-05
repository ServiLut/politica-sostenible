import Link from "next/link";
import { ShieldCheck, LogIn, UserPlus } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-brand-gray-50 px-4 text-center">
      <div className="max-w-3xl w-full">
        <div className="mb-8 flex justify-center">
          <div className="p-4 bg-brand-black rounded-2xl shadow-soft-xl">
            <ShieldCheck className="w-12 h-12 text-white" />
          </div>
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold text-brand-black mb-4 tracking-tight break-words px-4">
          POLÍTICA <span className="text-brand-green-600">SOSTENIBLE</span>
        </h1>

        <p className="text-lg md:text-xl text-brand-gray-500 mb-10 leading-relaxed max-w-2xl mx-auto">
          Plataforma integral para la soberanía de datos y estrategia electoral.
          Gestión avanzada, seguridad garantizada y análisis en tiempo real.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="w-full sm:w-auto btn-primary-friendly text-lg px-8 py-4"
          >
            <LogIn className="w-5 h-5" />
            Iniciar Sesión
          </Link>

          <Link
            href="/signup"
            className="w-full sm:w-auto flex items-center justify-center gap-2 border-2 border-brand-gray-200 text-brand-gray-900 px-8 py-4 rounded-xl font-bold hover:bg-white hover:border-brand-black transition-all active:scale-95 text-lg"
          >
            <UserPlus className="w-5 h-5" />
            Crear Cuenta
          </Link>
        </div>
      </div>

      <footer className="absolute bottom-8 text-brand-gray-500 text-sm">
        &copy; {new Date().getFullYear()} Política Sostenible - Todos los derechos
        reservados.
      </footer>
    </main>
  );
}
