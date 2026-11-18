import type { InsightDto } from "@yunque/core";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BarChart } from "../components/BarChart.js";
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
import { CHANNEL_LABEL, timeAgo, usd } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </Card>
  );
}

// ---------- Analista ----------

const FILTERS = [
  ["all", "Todas"],
  ["upset", "Clientes molestos"],
  ["open_sale", "Ventas abiertas"],
  ["low", "Calificación baja"],
] as const;

const SENTIMENT_TONE: Record<InsightDto["sentiment"], "green" | "slate" | "red"> = {
  positivo: "green",
  neutral: "slate",
  negativo: "red",
};

export function AnalystPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const { data, error, loading, reload } = useApi(() => api.insights(filter), filter, 60_000);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function runNow() {
    setRunning(true);
    try {
      const r = await api.runAutomation();
      setNote(
        `Listo: ${r.closed} cerradas, ${r.analyzed} analizadas, ${r.hunted} seguimientos, ${r.alerts} alertas.`,
      );
      await reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "No se pudo correr");
    } finally {
      setRunning(false);
    }
  }

  const s = data?.summary;
  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Analista"
        description="El Vigilante lee cada conversación terminada (3 h de silencio) y te dice qué querían tus clientes, si quedaron contentos y qué ventas siguen abiertas."
        actions={
          <Button variant="secondary" disabled={running} onClick={() => void runNow()}>
            {running ? "Analizando…" : "Analizar ahora"}
          </Button>
        }
      />
      {note ? (
        <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{note}</p>
      ) : null}
      <ErrorNote message={error} />
      {s ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="Analizadas (30 días)" value={s.analyzed} />
          <Tile label="Calificación promedio" value={s.averageRating ?? "—"} hint="de 1 a 5" />
          <Tile label="Resueltas sin humano" value={`${s.resolvedWithoutHumanPct}%`} />
          <Tile label="Ventas abiertas" value={s.openSales} />
          <Tile label="Clientes molestos" value={s.upset} />
        </div>
      ) : null}
      {s && (s.topIntents.length || s.topObjections.length) ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(
            [
              ["Lo que más piden", s.topIntents],
              ["Objeciones más comunes", s.topObjections],
            ] as const
          ).map(([title, list]) => (
            <Card key={title} className="p-4">
              <p className="text-sm font-semibold">{title}</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {list.length ? (
                  list.map((x) => (
                    <li key={x.label}>
                      {x.label} · {x.count}
                    </li>
                  ))
                ) : (
                  <li>—</li>
                )}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="mt-6 mb-3 flex flex-wrap gap-2">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cx(
              "rounded-full px-3 py-1 text-sm font-medium",
              filter === id
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {loading && !data ? (
        <Spinner />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState title="Aún no hay conversaciones analizadas">
            Se analizan solas 3 horas después del último mensaje. También puedes usar «Analizar
            ahora».
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((i) => (
            <Card key={i.conversationId} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-sm font-semibold">
                  {i.contactName ?? `Cliente ${i.contactExternalId.slice(-6)}`}
                </span>
                <Badge>{CHANNEL_LABEL[i.channel]}</Badge>
                <Badge tone={SENTIMENT_TONE[i.sentiment]}>
                  {i.rating}/5 · {i.sentiment}
                </Badge>
                {i.openSale ? <Badge tone="amber">Venta abierta</Badge> : null}
                {i.upset ? <Badge tone="red">Molesto</Badge> : null}
                <span className="text-slate-400">{timeAgo(i.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700">{i.summary}</p>
              <p className="mt-1 text-xs text-slate-500">
                {i.intent ? `Quería: ${i.intent}. ` : ""}
                {i.objection ? `Objeción: ${i.objection}. ` : ""}
                {i.unansweredQuestion ? `Sin respuesta: ${i.unansweredQuestion}.` : ""}
              </p>
              <Link
                to={`/bandeja/${i.conversationId}`}
                className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline"
              >
                Ver conversación →
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Estadísticas ----------

export function StatsPage() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useApi(() => api.stats(days), String(days), 120_000);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Estadísticas"
        description="El pulso de tu bot día a día."
        actions={
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium",
                  days === d
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200",
                )}
              >
                {d} días
              </button>
            ))}
          </div>
        }
      />
      <ErrorNote message={error} />
      {loading && !data ? (
        <Spinner />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Clientes que escribieron" value={data.contacts} />
            <Tile
              label="Volvieron a escribir"
              value={data.returningContacts}
              hint={
                data.contacts
                  ? `${Math.round((data.returningContacts / data.contacts) * 100)}% de retención`
                  : undefined
              }
            />
            <Tile label="Conversaciones analizadas" value={data.analyzed} />
            <Tile
              label="Calificación promedio"
              value={data.averageRating ?? "—"}
              hint="Vigilante, de 1 a 5"
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <BarChart
              title="Conversaciones por día"
              data={data.series.map((d) => ({ label: shortDay(d.day), value: d.conversations }))}
            />
            <BarChart
              title="Leads nuevos por día"
              data={data.series.map((d) => ({ label: shortDay(d.day), value: d.leads }))}
            />
            <BarChart
              title="Te necesitaron (handoffs)"
              data={data.series.map((d) => ({ label: shortDay(d.day), value: d.handoffs }))}
            />
            <BarChart
              title="Mensajes de clientes"
              data={data.series.map((d) => ({ label: shortDay(d.day), value: d.messages }))}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------- Costos ----------

export function CostsPage() {
  const { data, error, loading } = useApi(() => api.costs(), "costs", 120_000);
  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Costos"
        description="Lo que tu bot gasta en IA este mes, según los precios de tu proveedor. Puedes fijar un tope en Configuración."
      />
      <ErrorNote message={error} />
      {loading && !data ? (
        <Spinner />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Tile label="Gasto del mes" value={usd(data.monthUsd)} />
            <Tile label="Proyección al cierre" value={usd(data.projectedUsd)} />
            <Tile
              label="Tope mensual"
              value={data.budgetUsd ? usd(data.budgetUsd) : "Sin tope"}
              hint={
                data.budgetUsd
                  ? `${Math.round((data.monthUsd / data.budgetUsd) * 100)}% usado`
                  : undefined
              }
            />
          </div>
          <div className="mt-4">
            <BarChart
              title="Gasto por día"
              format={usd}
              data={data.byDay.map((d) => ({ label: shortDay(d.day), value: d.costUsd }))}
            />
          </div>
          <Card className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Modelo</th>
                  <th className="px-4 py-3 text-right font-medium">Llamadas</th>
                  <th className="px-4 py-3 text-right font-medium">Tokens entrada</th>
                  <th className="px-4 py-3 text-right font-medium">Tokens salida</th>
                  <th className="px-4 py-3 text-right font-medium">De caché</th>
                  <th className="px-4 py-3 text-right font-medium">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {data.byModel.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Sin uso este mes.
                    </td>
                  </tr>
                ) : (
                  data.byModel.map((m) => (
                    <tr key={`${m.provider}-${m.model}`}>
                      <td className="px-4 py-2">
                        {m.model} <span className="text-xs text-slate-400">{m.provider}</span>
                      </td>
                      <td className="px-4 py-2 text-right">{m.calls.toLocaleString("es")}</td>
                      <td className="px-4 py-2 text-right">{m.inputTokens.toLocaleString("es")}</td>
                      <td className="px-4 py-2 text-right">
                        {m.outputTokens.toLocaleString("es")}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {m.cacheReadTokens.toLocaleString("es")}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">{usd(m.costUsd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}
    </div>
  );
}
