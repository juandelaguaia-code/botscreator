import type { GapSource, KnowledgeGapDto } from "@yunque/core";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  Textarea,
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { timeAgo } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

const SOURCE: Record<GapSource, { label: string; tone: "amber" | "blue" | "red" }> = {
  kb_miss: { label: "No lo encontró", tone: "blue" },
  handoff: { label: "Escaló por falta de dato", tone: "amber" },
  verifier: { label: "Blindaje frenó un dato", tone: "red" },
};

type Status = "open" | "resolved" | "ignored";

export function ImprovementsPage() {
  const [status, setStatus] = useState<Status>("open");
  const { data, error, loading, reload } = useApi(() => api.gaps(status), status, 30_000);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        title="Mejoras"
        description="El radar de huecos: lo que tus clientes preguntaron y el bot no pudo responder con respaldo en los últimos 30 días. Responde una vez y esa duda deja de existir."
      />
      <div className="mb-4 flex gap-2">
        {(
          [
            ["open", "Por resolver"],
            ["resolved", "Resueltas"],
            ["ignored", "Ignoradas"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStatus(id)}
            className={cx(
              "rounded-full px-3 py-1 text-sm font-medium",
              status === id
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorNote message={error} />
      {loading && !data ? (
        <Spinner />
      ) : !data?.gaps.length ? (
        <Card>
          <EmptyState title={status === "open" ? "Sin huecos pendientes" : "Nada por aquí"}>
            {status === "open"
              ? "Cuando el bot no encuentre un dato, la pregunta aparecerá aquí para que la respondas."
              : null}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.gaps.map((g) => (
            <GapCard key={g.id} gap={g} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function GapCard({ gap, onChanged }: { gap: KnowledgeGapDto; onChanged: () => Promise<void> }) {
  const [answer, setAnswer] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{gap.question}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge tone={SOURCE[gap.source].tone}>{SOURCE[gap.source].label}</Badge>
            <span>
              {gap.hits} {gap.hits === 1 ? "vez" : "veces"} · última {timeAgo(gap.lastSeenAt)}
            </span>
            {gap.conversationId ? (
              <Link
                to={`/bandeja/${gap.conversationId}`}
                className="font-medium text-brand-700 hover:underline"
              >
                Ver conversación
              </Link>
            ) : null}
          </div>
          {gap.resolution ? (
            <p className="text-sm text-slate-600">Respuesta: {gap.resolution}</p>
          ) : null}
        </div>
        {gap.status === "open" && !open ? (
          <div className="flex gap-2">
            <Button onClick={() => setOpen(true)}>Responder</Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => api.ignoreGap(gap.id))}
            >
              Ignorar
            </Button>
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="mt-4 space-y-2">
          <Textarea
            rows={3}
            autoFocus
            maxLength={1500}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Escribe la respuesta correcta. Se agregará a tus preguntas frecuentes."
          />
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => api.resolveGap(gap.id))}
            >
              Marcar resuelta sin responder
            </Button>
            <Button
              disabled={busy || !answer.trim()}
              onClick={() => void run(() => api.resolveGap(gap.id, answer.trim()))}
            >
              Guardar en preguntas frecuentes
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
