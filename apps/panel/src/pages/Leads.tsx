import { LEAD_STATUSES, type LeadStatus } from "@yunque/core";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Select,
  Spinner,
} from "../components/ui.js";
import { api, EXPORTS } from "../lib/api.js";
import { CHANNEL_LABEL, dateTime } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

const STATUS_LABEL: Record<LeadStatus, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  ganado: "Ganado",
  perdido: "Perdido",
};

export function LeadsPage() {
  const { data, error, loading, reload } = useApi(() => api.leads(), "leads");
  const [saveError, setSaveError] = useState<string | null>(null);

  async function changeStatus(id: string, status: LeadStatus) {
    try {
      await api.updateLead(id, { status });
      await reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Clientes"
        description="Las personas que mostraron interés y dejaron sus datos."
        actions={
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm font-medium text-brand-700 ring-1 ring-slate-200 hover:bg-slate-50">
              Exportar ▾
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg bg-white p-1 shadow-lg ring-1 ring-slate-200">
              {EXPORTS.map((e) => (
                <a
                  key={e.href}
                  href={e.href}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100"
                >
                  {e.label}
                </a>
              ))}
            </div>
          </details>
        }
      />
      <ErrorNote message={error ?? saveError} />
      {loading && !data ? (
        <Spinner />
      ) : !data?.leads.length ? (
        <Card>
          <EmptyState title="Aún no hay leads">
            El bot los registra solo cuando alguien deja su nombre o contacto.
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Interés</th>
                <th className="px-4 py-3 font-medium">Canal</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.leads.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="px-4 py-3 font-medium">
                    {l.conversationId ? (
                      <Link className="hover:underline" to={`/bandeja/${l.conversationId}`}>
                        {l.name ?? "Sin nombre"}
                      </Link>
                    ) : (
                      (l.name ?? "Sin nombre")
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {l.phone ? <div>{l.phone}</div> : null}
                    {l.email ? <div>{l.email}</div> : null}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-slate-600">{l.interest ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge>{CHANNEL_LABEL[l.channel]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={l.status}
                      className="w-36"
                      onChange={(e) => void changeStatus(l.id, e.target.value as LeadStatus)}
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {dateTime(l.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
