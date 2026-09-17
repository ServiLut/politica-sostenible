import { FormEvent, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";

interface CreateLeaderModalProps {
  divisionId: string;
  divisionName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateLeaderModal({ divisionId, divisionName, onClose, onSuccess }: CreateLeaderModalProps) {
  const [name, setName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [socialNetworkUrl, setSocialNetworkUrl] = useState("");
  const [politicalAffinity, setPoliticalAffinity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiRequest(`/campaigns/divisions/${divisionId}/leaders`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          roleDescription: roleDescription.trim(),
          phone: phone.trim() || undefined,
          socialNetworkUrl: socialNetworkUrl.trim() || undefined,
          politicalAffinity: politicalAffinity.trim() || undefined,
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el líder");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900">
            <UserPlus size={20} className="text-blue-600" />
            Crear Líder
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-6 text-sm text-slate-500">
          Agrega un nuevo líder para el territorio <strong className="text-slate-700">{divisionName}</strong>.
        </p>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Nombre *
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Descripción de rol *
            <input
              required
              maxLength={200}
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
              placeholder="Ej. Coordinador de logística"
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Teléfono
            <input
              maxLength={20}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Red Social (URL)
            <input
              type="url"
              maxLength={500}
              value={socialNetworkUrl}
              onChange={(e) => setSocialNetworkUrl(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Afinidad Política
            <input
              maxLength={100}
              value={politicalAffinity}
              onChange={(e) => setPoliticalAffinity(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <div className="mt-6 flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading && <Loader2 className="animate-spin" size={16} />}
              Guardar Líder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
