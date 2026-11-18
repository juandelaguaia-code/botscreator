import { ADMIN_ONLY_TABS, type TeamUserDto, type UserRole } from "@yunque/core";
import { type FormEvent, useEffect, useState } from "react";
import { CopyButton } from "../components/CopyButton.js";
import { NAV } from "../components/Layout.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { dateTime, timeAgo } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

const ROLE_LABEL: Record<UserRole, string> = { admin: "Administrador", team: "Equipo" };
const STATUS: Record<TeamUserDto["status"], { label: string; tone: "green" | "amber" | "slate" }> =
  {
    active: { label: "Activo", tone: "green" },
    invited: { label: "Invitado", tone: "amber" },
    disabled: { label: "Desactivado", tone: "slate" },
  };

/** Pestañas que el Administrador puede abrirle al rol Equipo. */
const TEAM_ELIGIBLE = NAV.flatMap((g) => g.items).filter(
  (i) => !(ADMIN_ONLY_TABS as readonly string[]).includes(i.to),
);

export function TeamPage() {
  const team = useApi(() => api.team(), "team");
  const audit = useApi(() => api.teamAudit(), "audit");
  const [link, setLink] = useState<{ name: string; url: string; kind: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await Promise.all([team.reload(), audit.reload()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Equipo"
        description="Accesos personales al panel: cada persona entra con su correo y contraseña. El Administrador ve todo; el rol Equipo solo las secciones que elijas."
      />

      <InviteForm
        onInvited={async (name, url) => {
          setLink({ name, url, kind: "invite" });
          await Promise.all([team.reload(), audit.reload()]);
        }}
      />

      {link ? (
        <Card className="space-y-2 border-l-4 border-brand-600 p-4">
          <p className="text-sm font-medium">
            {link.kind === "invite"
              ? `Invitación para ${link.name}`
              : `Link nuevo para ${link.name}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-slate-50 px-2 py-1.5 text-xs">
              {link.url}
            </code>
            <CopyButton text={link.url} label="Copiar link" />
          </div>
          <p className="text-xs text-slate-500">
            {link.kind === "invite"
              ? "Vale 7 días y sirve una sola vez. Mándaselo por WhatsApp o correo."
              : "Vale 1 hora y sirve una sola vez: al usarlo elige una contraseña nueva."}
          </p>
        </Card>
      ) : null}

      <ErrorNote message={error ?? team.error} />

      <Card>
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Accesos</h2>
        </div>
        {team.loading && !team.data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !team.data?.users.length ? (
          <EmptyState title="Todavía no hay accesos personales">
            Invita a tu equipo arriba. Mientras tanto, el panel funciona con la contraseña maestra.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {team.data.users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-sm font-medium">
                    {u.name}{" "}
                    <span className="font-normal text-slate-500">
                      · {u.email}
                      {u.position ? ` · ${u.position}` : ""}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {u.lastLoginAt ? `Entró ${timeAgo(u.lastLoginAt)}` : "Aún no entra"}
                    {u.whatsapp ? ` · WhatsApp ${u.whatsapp}` : ""}
                  </p>
                </div>
                <Badge tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Badge>
                <div className="w-40 shrink-0">
                  <Select
                    aria-label={`Rol de ${u.name}`}
                    value={u.role}
                    onChange={(e) =>
                      void run(() => api.teamUpdate(u.id, { role: e.target.value as UserRole }))
                    }
                  >
                    <option value="admin">{ROLE_LABEL.admin}</option>
                    <option value="team">{ROLE_LABEL.team}</option>
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void run(async () => {
                      const r = await api.teamLink(u.id);
                      setLink({ name: u.name, url: r.link, kind: r.kind });
                    })
                  }
                >
                  Nuevo link
                </Button>
                {u.status !== "invited" ? (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void run(() =>
                        api.teamUpdate(u.id, {
                          status: u.status === "active" ? "disabled" : "active",
                        }),
                      )
                    }
                  >
                    {u.status === "active" ? "Desactivar" : "Reactivar"}
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`¿Eliminar el acceso de ${u.name}? No se puede deshacer.`))
                      void run(() => api.teamRemove(u.id));
                  }}
                >
                  Eliminar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {team.data ? (
        <TeamSections initial={team.data.teamSections} onSaved={() => void audit.reload()} />
      ) : null}

      <Card>
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Bitácora</h2>
          <p className="text-xs text-slate-500">Quién entró y qué cambió en el panel.</p>
        </div>
        {!audit.data?.entries.length ? (
          <EmptyState title="Sin movimientos todavía" />
        ) : (
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {audit.data.entries.map((e) => (
              <li key={e.id} className="flex gap-3 px-4 py-2 text-sm">
                <span className="w-36 shrink-0 text-xs text-slate-500">
                  {dateTime(e.createdAt)}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{e.actorName ?? "Sistema"}</span> · {e.action}
                  {e.detail ? <span className="text-slate-500"> — {e.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: (name: string, link: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("team");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.teamInvite({ name: name.trim(), email: email.trim(), role });
      setName("");
      setEmail("");
      await onInvited(r.user.name, r.link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo invitar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-sm font-semibold">Invitar a alguien</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Correo">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Rol">
            <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="team">Equipo (secciones elegidas)</option>
              <option value="admin">Administrador (todo)</option>
            </Select>
          </Field>
          <Button type="submit" disabled={busy || !name.trim() || !email.trim()}>
            {busy ? "Invitando…" : "Invitar"}
          </Button>
        </div>
        <ErrorNote message={error} />
      </form>
    </Card>
  );
}

function TeamSections({ initial, onSaved }: { initial: string[]; onSaved: () => void }) {
  const [sections, setSections] = useState<string[]>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSections(initial), [initial]);

  async function save() {
    setError(null);
    try {
      await api.teamSections(sections);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Qué ve el rol Equipo</h2>
        <p className="text-xs text-slate-500">
          Configuración, Conexiones, Costos, Prompt, Modo agencia y Equipo quedan siempre fuera. El
          bloqueo también aplica en la API, no solo en el menú.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {TEAM_ELIGIBLE.map((item) => (
          <label key={item.to} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sections.includes(item.to)}
              onChange={(e) =>
                setSections((s) =>
                  e.target.checked ? [...s, item.to] : s.filter((t) => t !== item.to),
                )
              }
            />
            {item.label}
          </label>
        ))}
      </div>
      <ErrorNote message={error} />
      <Button onClick={() => void save()}>{saved ? "Guardado ✓" : "Guardar secciones"}</Button>
    </Card>
  );
}
