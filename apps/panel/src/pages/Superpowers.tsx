import type { SettingsDto } from "@yunque/core";
import { Link } from "react-router-dom";
import { CopyButton } from "../components/CopyButton.js";
import { Badge, Card, ErrorNote, PageHeader } from "../components/ui.js";
import { api } from "../lib/api.js";
import { type PowerStatus, SUPERPOWERS } from "../lib/catalog.js";
import { useApi } from "../lib/hooks.js";

const STATUS: Record<PowerStatus, { label: string; tone: "green" | "amber" | "slate" }> = {
  activo: { label: "Activo", tone: "green" },
  parcial: { label: "Parcial", tone: "amber" },
  proximamente: { label: "Próximamente", tone: "slate" },
};

/** Estado en vivo de los superpoderes que tienen un ajuste propio. */
function liveState(id: string, data: SettingsDto | null): string | null {
  if (!data) return null;
  const { settings, profile } = data;
  switch (id) {
    case "blindaje":
      return settings.verifierEnabled
        ? `Encendido · umbral ${settings.kbMinScore ?? `auto (${data.knowledge.recommendedMinScore})`}`
        : "Verificador apagado";
    case "handoff":
      return `Se aparta ${settings.takeoverMinutes} min al responder tú`;
    case "botones":
      return settings.buttonsEnabled ? "Encendidos" : "Apagados";
    case "voz":
      return `Tono: ${profile.tone}`;
    case "idiomas":
      return `Idioma: ${profile.language}`;
    case "vigilante":
      return settings.automation.vigilante ? "Encendido" : "Apagado";
    case "cazador":
      return settings.automation.hunter
        ? `Encendido · máx. ${settings.automation.hunterDailyMax}/día`
        : "Apagado";
    case "encuestas":
      return settings.automation.surveys ? "Encendidas" : "Apagadas";
    case "no-shows":
      return settings.automation.noShows
        ? `Encendido · a los ${settings.automation.noShowAfterDays} días`
        : "Apagado";
    case "resenas":
      return profile.reviewUrl
        ? settings.automation.reviews
          ? "Encendido"
          : "Apagado"
        : "Falta tu link de reseñas";
    case "reportes":
      return settings.automation.dailyReport
        ? `Cada noche a las ${settings.automation.dailyReportHour}:00`
        : "Apagado";
    case "cobros":
      return settings.payments.enabled
        ? `Encendido · ${settings.payments.currency.toUpperCase()}`
        : "Apagado";
    default:
      return null;
  }
}

export function SuperpowersPage() {
  const { data, error } = useApi(() => api.settings(), "superpowers");
  const active = SUPERPOWERS.filter((p) => p.status !== "proximamente").length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Superpoderes"
        description={`Sistemas que trabajan solos dentro de tu bot. ${active} de ${SUPERPOWERS.length} ya funcionan; el resto llega en las próximas fases. Copia el prompt y pégalo en Claude Code dentro de este repo.`}
      />
      <ErrorNote message={error} />
      <div className="grid gap-4 md:grid-cols-2">
        {SUPERPOWERS.map((p) => {
          const live = liveState(p.id, data);
          return (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">
                    <span aria-hidden className="mr-2">
                      {p.icon}
                    </span>
                    {p.name}
                  </p>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    {p.tagline}
                  </p>
                </div>
                <Badge tone={STATUS[p.status].tone}>
                  {STATUS[p.status].label}
                  {p.status !== "activo" ? ` · fase ${p.phase}` : ""}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-slate-600">{p.description}</p>
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                {p.rules.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                <div className="text-xs">
                  {live ? <p className="font-medium text-emerald-700">{live}</p> : null}
                  {p.configure ? (
                    <Link to="/configuracion" className="text-brand-700 hover:underline">
                      {p.configure}
                    </Link>
                  ) : null}
                </div>
                <CopyButton text={p.prompt} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
