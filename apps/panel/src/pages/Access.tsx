import { type FormEvent, useState } from "react";
import { Button, ErrorNote, Field, Input, Spinner } from "../components/ui.js";
import { api } from "../lib/api.js";
import { useApi } from "../lib/hooks.js";

/**
 * Link de invitación o de recuperación (`/admin/acceso/:token`). Es pública: la persona elige su
 * contraseña y entra directo al panel. El link es de un solo uso.
 */
export function AccessPage({ token, onDone }: { token: string; onDone: () => void }) {
  const info = useApi(() => api.accessInfo(token), token);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [position, setPosition] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    setError(null);
    try {
      await api.accessAccept(token, {
        password,
        ...(whatsapp.trim() ? { whatsapp: whatsapp.trim() } : {}),
        ...(position.trim() ? { position: position.trim() } : {}),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  const invite = info.data?.kind === "invite";

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        {info.loading && !info.data ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !info.data?.valid ? (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold">Este link ya no sirve</h1>
            <p className="text-sm text-slate-500">
              Venció o ya se usó. Pídele al Administrador del panel que te genere uno nuevo desde
              Equipo, o usa “¿Olvidaste tu contraseña?” en la pantalla de entrada.
            </p>
            <Button className="w-full" onClick={onDone}>
              Ir a la entrada
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <h1 className="text-lg font-semibold">
                {invite ? `Hola, ${info.data.name}` : "Elige una contraseña nueva"}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {invite
                  ? "Te invitaron al panel del bot. Elige tu contraseña para entrar."
                  : `Para el acceso ${info.data.email}.`}
              </p>
            </div>
            <Field label="Correo">
              <Input value={info.data.email ?? ""} disabled autoComplete="username" />
            </Field>
            <Field label="Contraseña" hint="Mínimo 8 caracteres.">
              <Input
                type="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Repite la contraseña">
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            {invite ? (
              <>
                <Field label="Tu WhatsApp (opcional)" hint="Para que el equipo te ubique.">
                  <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                </Field>
                <Field label="Tu cargo (opcional)">
                  <Input value={position} onChange={(e) => setPosition(e.target.value)} />
                </Field>
              </>
            ) : null}
            <ErrorNote message={error} />
            <Button type="submit" className="w-full" disabled={busy || !password || !confirm}>
              {busy ? "Guardando…" : invite ? "Activar mi acceso" : "Guardar y entrar"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
