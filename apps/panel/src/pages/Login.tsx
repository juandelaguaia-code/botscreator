import { type FormEvent, useState } from "react";
import { Button, ErrorNote, Field, Input } from "../components/ui.js";
import { api } from "../lib/api.js";

export function LoginPage({
  botName,
  hasPassword,
  onLoggedIn,
}: {
  botName: string;
  hasPassword: boolean;
  onLoggedIn: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200"
      >
        <div>
          <h1 className="text-lg font-semibold">{botName || "Panel del bot"}</h1>
          <p className="mt-1 text-sm text-slate-500">Entra con la contraseña del panel.</p>
        </div>
        {!hasPassword ? (
          <ErrorNote message="Este bot aún no tiene contraseña. Configura el secreto DASHBOARD_PASSWORD y vuelve a desplegar." />
        ) : null}
        <Field label="Contraseña">
          <Input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorNote message={error} />
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
