import type { CampaignInput, LeadStatus } from "@yunque/core";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
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
  Textarea,
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { dateTime } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

// ---------- Agenda y cobros ----------

export function SalesPage() {
  const appointments = useApi(() => api.appointments(), "appointments", 60_000);
  const payments = useApi(() => api.payments(), "payments", 60_000);
  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Agenda y cobros"
        description="Citas que el bot reservó en tu Cal.com y links de pago que mandó por Stripe. Actívalos en Configuración."
      />
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Próximas citas
      </h2>
      <ErrorNote message={appointments.error} />
      {appointments.loading && !appointments.data ? (
        <Spinner />
      ) : !appointments.data?.appointments.length ? (
        <Card>
          <EmptyState title="Sin citas">
            Cuando el bot agende, aparecerán aquí con su recordatorio.
          </EmptyState>
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100">
          {appointments.data.appointments.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{a.attendeeName ?? "Cliente"}</p>
                <p className="text-slate-500">{dateTime(a.startAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={a.status === "confirmed" ? "green" : "slate"}>
                  {a.status === "confirmed" ? "Confirmada" : "Cancelada"}
                </Badge>
                {a.remindedAt ? <Badge tone="blue">Recordada</Badge> : null}
                {a.conversationId ? (
                  <Link
                    className="text-brand-700 hover:underline"
                    to={`/bandeja/${a.conversationId}`}
                  >
                    Chat
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </Card>
      )}

      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Cobros
      </h2>
      <ErrorNote message={payments.error} />
      {payments.loading && !payments.data ? (
        <Spinner />
      ) : !payments.data?.payments.length ? (
        <Card>
          <EmptyState title="Sin cobros">
            Cuando el bot mande un link de pago, verás aquí si ya se pagó.
          </EmptyState>
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100">
          {payments.data.payments.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{p.concept}</p>
                <p className="text-slate-500">
                  {p.amount.toLocaleString("es")} {p.currency.toUpperCase()} ·{" "}
                  {dateTime(p.createdAt)}
                </p>
              </div>
              <Badge
                tone={p.status === "paid" ? "green" : p.status === "pending" ? "amber" : "slate"}
              >
                {p.status === "paid" ? "Pagado" : p.status === "pending" ? "Pendiente" : "Vencido"}
              </Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------- Campañas ----------

const CHANNEL_OPTIONS: Array<[CampaignInput["segment"]["channels"][number], string]> = [
  ["whatsapp", "WhatsApp"],
  ["telegram", "Telegram"],
  ["instagram", "Instagram"],
  ["messenger", "Messenger"],
];
const STATUS_OPTIONS: Array<[LeadStatus, string]> = [
  ["nuevo", "Nuevos"],
  ["contactado", "Contactados"],
  ["ganado", "Ganados"],
  ["perdido", "Perdidos"],
];

export function CampaignsPage() {
  const { data, error, loading, reload } = useApi(() => api.campaigns(), "campaigns", 30_000);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Hola {nombre}, ");
  const [channels, setChannels] = useState<CampaignInput["segment"]["channels"]>([
    "whatsapp",
    "telegram",
  ]);
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api.campaignCreate({ name, message, segment: { channels, statuses } });
      setName("");
      setMessage("Hola {nombre}, ");
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  async function send(id: string) {
    if (!window.confirm("¿Enviar la campaña? Se manda por lotes cada 15 minutos.")) return;
    setBusy(true);
    try {
      await api.campaignSend(id);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Campañas"
        description="Mensajes a tus clientes por segmento. En WhatsApp, fuera de las 24 h desde su último mensaje, solo sale con tu plantilla aprobada (Configuración → Plantillas)."
      />
      <Card className="p-5">
        <form onSubmit={create} className="space-y-4">
          <Field label="Nombre interno">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Promo de diciembre"
            />
          </Field>
          <Field label="Mensaje" hint="{nombre} se reemplaza por el nombre del cliente.">
            <Textarea
              rows={3}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Canales</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {CHANNEL_OPTIONS.map(([id, label]) => (
                  <label key={id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={channels.includes(id)}
                      onChange={() => setChannels(toggle(channels, id))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">
                Solo leads en estado (vacío = todos)
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                {STATUS_OPTIONS.map(([id, label]) => (
                  <label key={id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={statuses.includes(id)}
                      onChange={() => setStatuses(toggle(statuses, id))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <ErrorNote message={formError} />
          <Button
            type="submit"
            disabled={busy || !name.trim() || !message.trim() || channels.length === 0}
          >
            Crear borrador
          </Button>
        </form>
      </Card>

      <div className="mt-6">
        <ErrorNote message={error} />
        {loading && !data ? (
          <Spinner />
        ) : !data?.campaigns.length ? (
          <Card>
            <EmptyState title="Sin campañas todavía" />
          </Card>
        ) : (
          <div className="space-y-3">
            {data.campaigns.map((c) => (
              <Card key={c.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{c.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {c.recipients} destinatarios · {c.sent} enviados · {c.skipped} omitidos ·{" "}
                    {c.failed} fallidos
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      c.status === "done" ? "green" : c.status === "sending" ? "amber" : "slate"
                    }
                  >
                    {c.status === "done"
                      ? "Terminada"
                      : c.status === "sending"
                        ? "Enviando"
                        : "Borrador"}
                  </Badge>
                  {c.status === "draft" ? (
                    <Button disabled={busy} onClick={() => void send(c.id)}>
                      Enviar
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Galería ----------

export function GalleryPage() {
  const { data, error, loading, reload } = useApi(() => api.gallery(), "gallery");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setFormError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("name", name);
      form.set("description", description);
      await api.galleryUpload(form);
      setFile(null);
      setName("");
      setDescription("");
      (e.target as HTMLFormElement).reset();
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo subir");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Galería"
        description="Fotos, videos, audios y PDFs reales de tu negocio. El bot los manda cuando vienen al caso: el menú, la casa, una nota de voz tuya."
      />
      {data && !data.storage ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Falta el bucket R2: `wrangler r2 bucket create yunque-bot-media` y vuelve a desplegar.
        </p>
      ) : null}
      <Card className="p-5">
        <form onSubmit={upload} className="grid gap-4 sm:grid-cols-2">
          <Field label="Archivo (máx. 15 MB)">
            <Input
              type="file"
              accept="image/*,video/*,audio/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field
            label="Nombre"
            hint="Cómo lo pedirá el bot, p. ej. «Menú» o «Recorrido de la casa»."
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Cuándo usarlo">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cuando pidan ver el menú o los precios"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <ErrorNote message={formError} />
            <Button type="submit" disabled={busy || !file || !name.trim() || !description.trim()}>
              {busy ? "Subiendo…" : "Subir"}
            </Button>
          </div>
        </form>
      </Card>
      <div className="mt-6">
        <ErrorNote message={error} />
        {loading && !data ? (
          <Spinner />
        ) : !data?.items.length ? (
          <Card>
            <EmptyState title="La galería está vacía" />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((i) => (
              <Card key={i.id} className="overflow-hidden">
                {i.kind === "image" ? (
                  <img src={i.url} alt={i.name} className="h-40 w-full object-cover" />
                ) : null}
                <div className="p-4">
                  <p className="font-medium">{i.name}</p>
                  <p className="text-sm text-slate-500">{i.description}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {i.kind} · {Math.round(i.size / 1024)} KB
                    </span>
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => {
                        if (window.confirm(`¿Borrar «${i.name}»?`))
                          void api.galleryDelete(i.id).then(reload);
                      }}
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
