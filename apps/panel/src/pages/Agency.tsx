import type { AgencyClientDto, AgencyLeadDto } from "@yunque/core";
import { type FormEvent, useState } from "react";
import { CopyButton } from "../components/CopyButton.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Spinner,
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { AGENCY_PIPELINE } from "../lib/catalog.js";
import { CHANNEL_LABEL, dateTime, usd } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

function ClientCard({ client, onRemove }: { client: AgencyClientDto; onRemove: () => void }) {
  const s = client.summary;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{client.name}</p>
          <p className="truncate text-xs text-slate-500">
            {client.niche ?? "sin giro"} · {client.url.replace(/^https?:\/\//, "")}
          </p>
        </div>
        <Badge tone={client.online ? "green" : "red"}>
          {client.online ? "En línea" : "Sin conexión"}
        </Badge>
      </div>
      {s ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Conversaciones 24 h</dt>
            <dd className="font-semibold tabular-nums">{s.conversations24h}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Leads 30 días</dt>
            <dd className="font-semibold tabular-nums">{s.newLeads30d}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Te necesitan</dt>
            <dd className="font-semibold tabular-nums">{s.needsHuman}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Gasto IA del mes</dt>
            <dd className="font-semibold tabular-nums">{usd(s.costMonthUsd)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-red-600">{client.error}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-sm">
        <span className="text-xs text-slate-400">
          {client.version ? `v${client.version}` : ""}
          {client.monthlyFee ? ` · cobras ${usd(client.monthlyFee)}/mes` : ""}
        </span>
        <div className="flex gap-3">
          <a
            className="font-medium text-brand-700 hover:underline"
            href={`${client.url}/admin/`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir panel
          </a>
          <button type="button" className="text-slate-500 hover:text-red-600" onClick={onRemove}>
            Quitar
          </button>
        </div>
      </div>
    </Card>
  );
}

export function AgencyPage() {
  const { data, error, loading, reload } = useApi(() => api.agencyClients(), "agency", 60_000);
  const leads = useApi(() => api.agencyLeads(), "agency-leads", 120_000);
  const [form, setForm] = useState({ name: "", niche: "", url: "", token: "", monthlyFee: "" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api.agencyAdd({
        name: form.name,
        url: form.url,
        token: form.token,
        ...(form.niche ? { niche: form.niche } : {}),
        ...(form.monthlyFee ? { monthlyFee: Number(form.monthlyFee) } : {}),
      });
      setForm({ name: "", niche: "", url: "", token: "", monthlyFee: "" });
      await Promise.all([reload(), leads.reload()]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo agregar");
    } finally {
      setBusy(false);
    }
  }

  const clients = data?.clients ?? [];
  const revenue = clients.reduce((sum, c) => sum + (c.monthlyFee ?? 0), 0);
  const costs = clients.reduce((sum, c) => sum + (c.summary?.costMonthUsd ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Modo agencia"
        description="Tu central: los bots de tus clientes en un portafolio, leídos en vivo, y el pipeline de prospecto a cliente que paga."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Clientes</p>
          <p className="text-xl font-semibold">{clients.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">En línea</p>
          <p className="text-xl font-semibold">{clients.filter((c) => c.online).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Ingreso mensual</p>
          <p className="text-xl font-semibold">{usd(revenue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Costo de IA de tus clientes</p>
          <p className="text-xl font-semibold">{usd(costs)}</p>
        </Card>
      </div>

      <ErrorNote message={error} />
      {loading && !data ? (
        <Spinner />
      ) : clients.length === 0 ? (
        <Card>
          <EmptyState title="Tu portafolio está vacío">
            Monta el bot de tu cliente con /cliente-nuevo, define su secreto AGENCY_TOKEN y agrégalo
            abajo.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              onRemove={() => {
                if (
                  window.confirm(`¿Quitar a ${c.name} del portafolio? Su bot sigue funcionando.`)
                ) {
                  void api.agencyRemove(c.id).then(reload);
                }
              }}
            />
          ))}
        </div>
      )}

      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Agregar el bot de un cliente</h2>
        <p className="mt-1 text-sm text-slate-500">
          En el bot del cliente:{" "}
          <code className="rounded bg-slate-100 px-1">npx wrangler secret put AGENCY_TOKEN</code>{" "}
          con un valor largo y aleatorio (p. ej.{" "}
          <code className="rounded bg-slate-100 px-1">openssl rand -hex 32</code>), y pega aquí ese
          mismo valor.
        </p>
        <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Nombre del negocio">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Giro">
            <Input
              value={form.niche}
              onChange={(e) => setForm({ ...form, niche: e.target.value })}
              placeholder="barbería, dentista…"
            />
          </Field>
          <Field label="URL del bot">
            <Input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://cliente.workers.dev"
            />
          </Field>
          <Field label="Token de agencia">
            <Input
              type="password"
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
            />
          </Field>
          <Field label="Lo que le cobras al mes (opcional)">
            <Input
              type="number"
              min={0}
              value={form.monthlyFee}
              onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
            />
          </Field>
          <div className="self-end">
            <Button
              type="submit"
              disabled={busy || !form.name || !form.url || form.token.length < 16}
            >
              {busy ? "Conectando…" : "Agregar al portafolio"}
            </Button>
          </div>
          <div className="sm:col-span-2">
            <ErrorNote message={formError} />
          </div>
        </form>
      </Card>

      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Clientes de todos tus bots
      </h2>
      <LeadsInbox
        leads={leads.data?.leads ?? []}
        failed={leads.data?.failed ?? []}
        loading={leads.loading && !leads.data}
      />

      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Pipeline de prospecto a cliente
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        {AGENCY_PIPELINE.map((step) => (
          <Card key={step.command} className="flex flex-col p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {step.stage}
            </p>
            <p className="mt-1 font-semibold">
              {step.title} <code className="text-xs text-slate-500">{step.command}</code>
            </p>
            <p className="mt-1 flex-1 text-sm text-slate-500">{step.description}</p>
            <div className="mt-3">
              <CopyButton text={step.prompt} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function LeadsInbox({
  leads,
  failed,
  loading,
}: {
  leads: AgencyLeadDto[];
  failed: string[];
  loading: boolean;
}) {
  if (loading) return <Spinner />;
  return (
    <Card className="overflow-x-auto">
      {failed.length ? (
        <p className="px-4 pt-3 text-xs text-red-600">Sin respuesta de: {failed.join(", ")}</p>
      ) : null}
      {leads.length === 0 ? (
        <EmptyState title="Aún no hay leads en tus bots" />
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Negocio</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Interés</th>
              <th className="px-4 py-3 font-medium">Canal</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.slice(0, 100).map((l) => (
              <tr key={`${l.clientId}-${l.id}`}>
                <td className="px-4 py-2 font-medium">{l.clientName}</td>
                <td className="px-4 py-2">{l.name ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{l.phone ?? l.email ?? "—"}</td>
                <td className="max-w-xs truncate px-4 py-2 text-slate-600">{l.interest ?? "—"}</td>
                <td className="px-4 py-2">{CHANNEL_LABEL[l.channel]}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                  {dateTime(l.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
