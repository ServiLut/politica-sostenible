export default function DashboardPage() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Abriendo el panel disponible"
      className="flex h-full min-h-64 items-center justify-center"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          aria-hidden="true"
          className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600 motion-reduce:animate-none"
        />
        <p className="text-sm font-semibold text-slate-500">
          Abriendo tu espacio de trabajo…
        </p>
      </div>
    </div>
  );
}
