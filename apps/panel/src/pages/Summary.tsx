import { Link } from "react-router-dom";
import { Card, ErrorNote, PageHeader, Spinner } from "../components/ui.js";
import { api } from "../lib/api.js";
import { usd } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

function Stat({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: string | number;
  hint?: string;
  to?: string;
}) {
  const body = (
    <Card className="p-5 transition-shadow hover:shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function SummaryPage() {
  const { data, error, loading } = useApi(() => api.summary(), "summary", 30_000);
  const origin = window.location.origin;
  const snippet = `<script src="${origin}/widget.js" data-title="Chatea con nosotros" data-color="#2563eb" defer></script>`;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Resumen"
        description="Cómo va tu bot, con números de tus conversaciones reales."
      />
      <ErrorNote message={error} />
      {loading && !data ? (
        <Spinner />
      ) : data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="Conversaciones (24 h)"
            value={data.conversations24h}
            hint={`${data.messages24h} mensajes`}
            to="/bandeja"
          />
          <Stat
            label="Te necesitan"
            value={data.needsHuman}
            hint="esperan a una persona"
            to="/bandeja?filtro=needs_human"
          />
          <Stat label="Leads nuevos (30 días)" value={data.newLeads30d} to="/clientes" />
          <Stat label="Clientes únicos (30 días)" value={data.uniqueContacts30d} />
          <Stat
            label="Resueltas sin humano"
            value={`${data.resolvedWithoutHumanPct}%`}
            hint="últimos 30 días"
          />
          <Stat label="Tickets abiertos" value={data.openTickets} to="/tickets" />
          <Stat
            label="Gasto de IA del mes"
            value={usd(data.costMonthUsd)}
            hint="según tu proveedor"
          />
        </div>
      ) : null}

      <Card className="mt-8 p-6">
        <h2 className="font-semibold">Pon el chat en tu página web</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pega esta línea antes de <code className="rounded bg-slate-100 px-1">&lt;/body&gt;</code>{" "}
          en tu sitio. Sin tokens ni verificaciones.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
          {snippet}
        </pre>
        <button
          type="button"
          className="mt-3 text-sm font-medium text-brand-700 hover:underline"
          onClick={() => void navigator.clipboard.writeText(snippet)}
        >
          Copiar código
        </button>
      </Card>
    </div>
  );
}
