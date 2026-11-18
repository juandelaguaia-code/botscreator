import type { TicketKind } from "@yunque/core";
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
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { dateTime } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

const KIND: Record<TicketKind, { label: string; tone: "amber" | "blue" | "red" }> = {
  handoff: { label: "Te necesitan", tone: "amber" },
  knowledge_gap: { label: "Hueco de información", tone: "blue" },
  system: { label: "Sistema", tone: "red" },
};

export function TicketsPage() {
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const { data, error, loading, reload } = useApi(() => api.tickets(status), status, 15_000);
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(id: string) {
    setBusy(id);
    try {
      await api.resolveTicket(id);
      await reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        title="Tickets"
        description="Cada vez que el bot te pasó una conversación o algo falló, queda aquí con su motivo."
      />
      <div className="mb-4 flex gap-2">
        {(["open", "resolved"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cx(
              "rounded-full px-3 py-1 text-sm font-medium",
              status === s
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200",
            )}
          >
            {s === "open" ? "Abiertos" : "Resueltos"}
          </button>
        ))}
      </div>
      <ErrorNote message={error} />
      {loading && !data ? (
        <Spinner />
      ) : !data?.tickets.length ? (
        <Card>
          <EmptyState title={status === "open" ? "Nada pendiente" : "Sin tickets resueltos"} />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.tickets.map((t) => (
            <Card key={t.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge tone={KIND[t.kind].tone}>{KIND[t.kind].label}</Badge>
                  <span className="text-xs text-slate-400">{dateTime(t.createdAt)}</span>
                </div>
                <p className="text-sm">{t.reason}</p>
                {t.conversationId ? (
                  <Link
                    to={`/bandeja/${t.conversationId}`}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    Ver conversación →
                  </Link>
                ) : null}
              </div>
              {t.status === "open" ? (
                <Button
                  variant="secondary"
                  disabled={busy === t.id}
                  onClick={() => void resolve(t.id)}
                >
                  Marcar resuelto
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
