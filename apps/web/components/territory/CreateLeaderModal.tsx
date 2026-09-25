import { FormEvent, useRef, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CreateLeaderModalProps {
  divisionId: string;
  divisionName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateLeaderModal({
  divisionId,
  divisionName,
  onClose,
  onSuccess,
}: CreateLeaderModalProps) {
  const [name, setName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [socialNetworkUrl, setSocialNetworkUrl] = useState("");
  const [politicalAffinity, setPoliticalAffinity] = useState("");
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const submitInFlight = useRef(false);
  useAccessibleDialog({
    open: true,
    containerRef: dialogRef,
    onClose,
    closeOnEscape: !loading,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitInFlight.current) return;
    if (!name.trim() || !roleDescription.trim()) {
      setError("Escribe el nombre completo y el rol o cargo.");
      return;
    }
    submitInFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      await apiRequest(
        `campaigns/divisions/${encodeURIComponent(divisionId)}/leaders`,
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            roleDescription: roleDescription.trim(),
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            socialNetworkUrl: socialNetworkUrl.trim() || undefined,
            politicalAffinity: politicalAffinity.trim() || undefined,
            observations: observations.trim() || undefined,
          }),
        },
      );
      onSuccess();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al crear el líder",
      );
      setLoading(false);
    } finally {
      submitInFlight.current = false;
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leader-dialog-title"
        aria-describedby="leader-dialog-description"
        aria-busy={loading}
        tabIndex={-1}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:max-h-[calc(100dvh-2.5rem)] sm:p-6"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="leader-dialog-title"
            className="flex items-center gap-2 text-xl font-semibold text-slate-900"
          >
            <UserPlus aria-hidden="true" size={20} className="text-blue-600" />
            Crear líder
          </h2>
          <Button
            type="button"
            disabled={loading}
            aria-label="Cerrar formulario de líder"
            onClick={onClose}
            variant="ghost"
            size="icon"
          >
            <X aria-hidden="true" size={20} />
          </Button>
        </div>

        <p id="leader-dialog-description" className="mb-6 text-sm leading-6 text-slate-600">
          Agrega un nuevo líder para{" "}
          <strong className="text-slate-700">{divisionName}</strong>. Puede ser
          un edil JAL, presidente JAC, coordinador de zona o cualquier contacto
          clave.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={loading} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Nombre completo *
            <Input
              required
              autoComplete="name"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. María López Cardona"
              className="mt-1 font-normal"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Rol o cargo *
            <Input
              required
              maxLength={200}
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
              placeholder="Ej. Edil JAL Comuna 5, Presidente JAC Barrio X"
              className="mt-1 font-normal"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Teléfono / WhatsApp
              <Input
                type="tel"
                autoComplete="tel"
                maxLength={20}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="300 123 4567"
                className="mt-1 font-normal"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Correo electrónico
              <Input
                type="email"
                autoComplete="email"
                maxLength={200}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@correo.com"
                className="mt-1 font-normal"
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Red social o perfil público
            <Input
              type="url"
              maxLength={500}
              value={socialNetworkUrl}
              onChange={(e) => setSocialNetworkUrl(e.target.value)}
              placeholder="https://facebook.com/marialopez"
              className="mt-1 font-normal"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Afinidad política
            <Input
              maxLength={100}
              value={politicalAffinity}
              onChange={(e) => setPoliticalAffinity(e.target.value)}
              placeholder="Ej. Aliado, Neutral, Oposición"
              className="mt-1 font-normal"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Observaciones
            <textarea
              maxLength={1000}
              rows={3}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Notas internas sobre este contacto..."
              className="mt-1 block min-h-24 w-full resize-y rounded-xl border border-slate-300 px-3.5 py-2.5 text-base font-normal text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:opacity-70 sm:text-sm"
            />
          </label>

          <div className="mt-6 flex flex-col-reverse justify-end gap-3 border-t border-slate-100 pt-4 sm:flex-row">
            <Button
              type="button"
              disabled={loading}
              onClick={onClose}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              aria-busy={loading}
            >
              {loading && <Loader2 aria-hidden="true" className="animate-spin" size={16} />}
              {loading ? "Guardando…" : "Guardar líder"}
            </Button>
          </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
