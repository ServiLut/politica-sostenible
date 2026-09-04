"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { changeOwnPassword } from "@/lib/auth-api";
import { ApiError } from "@/lib/api-client";
import { getRoleLabel, getTenantTypeLabel } from "@/config/navigation";

function formatTemporaryPasswordExpiry(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

export default function ProfilePage() {
  const { signOut, tenant, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requiresPasswordChange = user?.mustChangePassword === true;
  const temporaryPasswordExpiry = formatTemporaryPasswordExpiry(
    user?.temporaryPasswordExpiresAt,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword !== confirmation) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    setSaving(true);
    try {
      await changeOwnPassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setMessage(
        "Contraseña actualizada. Cerraremos esta sesión para que ingreses nuevamente.",
      );
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      signOut("/iniciar-sesion?passwordChanged=1");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No fue posible actualizar la contraseña.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {requiresPasswordChange && (
        <section
          role="alert"
          className="rounded-[2rem] border border-amber-300 bg-amber-50 p-6 text-amber-950 shadow-sm sm:p-7"
        >
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-200 text-amber-900">
              <AlertTriangle aria-hidden="true" size={25} />
            </span>
            <div>
              <h1 className="text-xl font-black">
                Debes crear tu contraseña personal ahora
              </h1>
              <p className="mt-2 text-sm font-medium leading-6">
                Ingresaste con una contraseña temporal. Por seguridad, todos
                los demás módulos permanecerán bloqueados hasta que la cambies.
              </p>
              {temporaryPasswordExpiry && (
                <p className="mt-3 text-sm font-black">
                  La credencial temporal vence el {temporaryPasswordExpiry}
                  (hora de Colombia).
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl sm:p-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-600">
            <UserRound aria-hidden="true" size={30} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">
              Identidad operativa
            </p>
            <h1 className="mt-2 truncate text-3xl font-black tracking-tight">
              {user?.name}
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              {user?.email} · {user ? getRoleLabel(user.backendRole) : ""}
            </p>
            {tenant && (
              <p className="mt-1 text-xs font-bold text-slate-400">
                {tenant.name} · {getTenantTypeLabel(tenant.type)}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <KeyRound aria-hidden="true" size={23} />
            </span>
            <div>
              <h2 className="text-xl font-black text-slate-950">
                Cambiar contraseña
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {requiresPasswordChange
                  ? "Escribe la clave temporal recibida y crea una contraseña exclusiva."
                  : "Usa una frase extensa y exclusiva para esta plataforma."}
              </p>
            </div>
          </div>

          <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="current-password">Contraseña actual</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                autoFocus={requiresPasswordChange}
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <p className="text-xs font-medium text-slate-500">
                Mínimo 12 caracteres.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password-confirmation">
                Confirmar nueva contraseña
              </Label>
              <Input
                id="password-confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700"
              >
                {error}
              </p>
            )}
            {message && (
              <p
                role="status"
                className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800"
              >
                {message}
              </p>
            )}

            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? "Actualizando..." : "Actualizar contraseña"}
            </Button>
          </form>
        </section>

        <aside className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-6 sm:p-7">
          <ShieldCheck
            className="text-emerald-700"
            aria-hidden="true"
            size={30}
          />
          <h2 className="mt-5 text-lg font-black text-emerald-950">
            Cambio protegido
          </h2>
          <ul className="mt-4 space-y-3 text-sm font-medium leading-6 text-emerald-950/75">
            <li>Se verifica tu contraseña vigente.</li>
            <li>La nueva clave se almacena con bcrypt.</li>
            <li>El evento queda registrado para auditoría.</li>
            <li>El tenant se obtiene de tu sesión, nunca del formulario.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
