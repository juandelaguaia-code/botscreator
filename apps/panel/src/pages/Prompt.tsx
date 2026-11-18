import type { Channel } from "@yunque/core";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  cx,
  ErrorNote,
  Input,
  PageHeader,
  Select,
  Spinner,
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { CHANNEL_LABEL, dateTime } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

const CHANNELS: Channel[] = ["web", "whatsapp", "telegram", "instagram", "messenger"];

export function PromptPage() {
  const [channel, setChannel] = useState<Channel>("web");
  const prompt = useApi(() => api.prompt(channel), channel);
  const versions = useApi(() => api.promptVersions(), "versions");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.promptSaveVersion(label.trim());
      setLabel("");
      setNote("Versión guardada.");
      await versions.reload();
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string, name: string) {
    if (
      !window.confirm(`¿Volver a «${name}»? La configuración actual queda guardada como versión.`)
    )
      return;
    setBusy(true);
    try {
      await api.promptRestore(id);
      setNote(`Restaurada «${name}». El siguiente mensaje ya usa esa versión.`);
      await Promise.all([versions.reload(), prompt.reload()]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Prompt"
        description="El cerebro del bot tal como lo recibe la IA. Lo tuyo (✏️) se edita en Configuración; lo del sistema (🔒) cuida la seguridad y no se toca."
        actions={
          <Select
            className="w-auto"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
          >
            {CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                Ver como {CHANNEL_LABEL[ch]}
              </option>
            ))}
          </Select>
        }
      />
      {note ? (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</p>
      ) : null}
      <ErrorNote message={prompt.error} />
      {prompt.loading && !prompt.data ? (
        <Spinner />
      ) : prompt.data ? (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {prompt.data.totalChars.toLocaleString("es")} caracteres fijos · se guardan en caché
            para responder más rápido y barato.
          </p>
          <div className="space-y-2">
            {prompt.data.sections.map((s, i) => {
              const key = `${s.id}-${i}`;
              return (
                <Card key={key} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpen(open === key ? null : key)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span aria-hidden>{s.locked ? "🔒" : "✏️"}</span>
                      {s.title}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={s.locked ? "slate" : "blue"}>
                        {s.locked ? "Sistema" : "Tuyo"}
                      </Badge>
                      <span className="text-xs text-slate-400">{open === key ? "▲" : "▼"}</span>
                    </span>
                  </button>
                  {open === key ? (
                    <pre className="whitespace-pre-wrap border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                      {s.text}
                    </pre>
                  ) : null}
                </Card>
              );
            })}
            <Card className="px-4 py-3">
              <p className="text-sm font-medium">⏱ Parte que cambia en cada mensaje</p>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
                {prompt.data.volatile}
              </pre>
            </Card>
          </div>
          <p className="mt-3 text-sm">
            <Link to="/configuracion" className="font-medium text-brand-700 hover:underline">
              Editar lo tuyo en Configuración →
            </Link>
          </p>
        </>
      ) : null}

      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Historial y deshacer
      </h2>
      <Card className="p-4">
        <form onSubmit={save} className="flex flex-wrap gap-2">
          <Input
            className="min-w-56 flex-1"
            placeholder="Nombre de la versión (p. ej. «Antes de la promo»)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button type="submit" disabled={busy || !label.trim()}>
            Guardar versión actual
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Cada vez que guardas la configuración, la anterior queda aquí automáticamente (últimas
          50).
        </p>
      </Card>
      <ErrorNote message={versions.error} />
      <div className="mt-3 space-y-2">
        {versions.data?.versions.map((v) => (
          <Card
            key={v.id}
            className={cx("flex flex-wrap items-center justify-between gap-3 px-4 py-3")}
          >
            <div className="min-w-0 text-sm">
              <p className="font-medium">{v.label}</p>
              <p className="text-xs text-slate-500">
                {dateTime(v.createdAt)}
                {v.author ? ` · ${v.author}` : ""} · giro {v.preview.giro} · tono {v.preview.tone} ·{" "}
                {v.preview.faq} FAQ · {v.preview.instructionsChars.toLocaleString("es")} caracteres
                de instrucciones
              </p>
            </div>
            <Button variant="secondary" disabled={busy} onClick={() => void restore(v.id, v.label)}>
              Restaurar
            </Button>
          </Card>
        ))}
        {versions.data && versions.data.versions.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay versiones guardadas.</p>
        ) : null}
      </div>
    </div>
  );
}
