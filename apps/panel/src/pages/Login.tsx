import type { SessionDto } from "@yunque/core";
import { type FormEvent, useState } from "react";
import { Button, ErrorNote, Field, Input } from "../components/ui.js";
import { api } from "../lib/api.js";

type Mode = "login" | "forgot" | "sent";

/** Pantalla de entrada: correo + contraseña (accesos personales) o solo la contraseña maestra. */
export function LoginPage({
  botName,
  hasPassword,
  branding,
  onLoggedIn,
}: {
  botName: string;
  hasPassword: boolean;
  branding: SessionDto["branding"] | null;
  onLoggedIn: () => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        await api.forgot(email.trim());
        setMode("sent");
      } else {
        await api.login(password, email.trim() || undefined);
        onLoggedIn();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setBusy(false);
    }
  }

  const title = branding?.loginTitle || botName || "Panel del bot";
  const subtitle =
    mode === "login"
      ? branding?.loginSubtitle || "Entra con tu correo y contraseña."
      : "Escribe el correo de tu acceso y te mandamos un link para elegir otra contraseña.";

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200"
      >
        <div>
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="mb-4 h-12 w-auto object-contain" />
          ) : null}
          <h1 className="text-lg font-semibold">{mode === "login" ? title : "Recuperar acceso"}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>

        {mode === "sent" ? (
          <>
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Listo. Si ese correo tiene un acceso activo, te llegará el link (vale 1 hora). Si el
              panel no tiene correo configurado, se lo avisamos al Administrador para que te lo
              pase.
            </p>
            <Button className="w-full" onClick={() => setMode("login")}>
              Volver a entrar
            </Button>
          </>
        ) : (
          <>
            {!hasPassword && mode === "login" ? (
              <ErrorNote message="Este bot aún no tiene contraseña maestra. Configura el secreto DASHBOARD_PASSWORD y vuelve a desplegar." />
            ) : null}
            <Field
              label="Correo"
              hint={
                mode === "login" ? "Déjalo vacío si entras con la contraseña maestra." : undefined
              }
            >
              <Input
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={mode === "forgot"}
              />
            </Field>
            {mode === "login" ? (
              <Field label="Contraseña">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            ) : null}
            <ErrorNote message={error} />
            <Button
              type="submit"
              className="w-full"
              disabled={busy || (mode === "login" ? !password : !email.trim())}
            >
              {busy ? "Un momento…" : mode === "login" ? "Entrar" : "Mandar link"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-brand-700 hover:underline"
              onClick={() => {
                setError(null);
                setMode(mode === "login" ? "forgot" : "login");
              }}
            >
              {mode === "login" ? "¿Olvidaste tu contraseña?" : "Volver"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
