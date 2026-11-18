import type { Channel } from "@yunque/core";
import { CopyButton } from "../components/CopyButton.js";
import { Badge, Card, ErrorNote, PageHeader, Spinner } from "../components/ui.js";
import { api } from "../lib/api.js";
import { CHANNEL_LABEL, timeAgo } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

const HELP: Partial<Record<Channel, string>> = {
  web: "Pega el código del Resumen en tu sitio. Sin tokens ni verificaciones.",
  telegram: "Crea el bot con @BotFather y registra el webhook (skill conectar-canal).",
  whatsapp:
    "Cloud API de Meta (recomendado) o Twilio. En Meta, suscribe el webhook al campo «messages».",
  instagram:
    "Con la página de Facebook vinculada a tu cuenta profesional; un solo webhook cubre Instagram y Messenger.",
  messenger: "Con el token de tu página de Facebook; mismo webhook que Instagram.",
};

export function ConnectionsPage() {
  const { data, error, loading } = useApi(() => api.connections(), "connections", 30_000);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Conexiones"
        description="Por dónde te escriben tus clientes. Cada canal se pone verde cuando tiene sus secretos; abajo ves cuándo llegó el último mensaje."
      />
      <ErrorNote message={error} />
      {loading && !data ? (
        <Spinner />
      ) : data ? (
        <>
          <div className="space-y-3">
            {data.channels.map((ch) => (
              <Card key={ch.channel} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{CHANNEL_LABEL[ch.channel]}</p>
                    <p className="mt-1 text-sm text-slate-500">{HELP[ch.channel]}</p>
                  </div>
                  <div className="text-right">
                    <Badge tone={ch.configured ? "green" : "slate"}>
                      {ch.configured ? "Conectado" : "Sin conectar"}
                    </Badge>
                    <p className="mt-1 text-xs text-slate-400">
                      {ch.lastInboundAt
                        ? `último mensaje ${timeAgo(ch.lastInboundAt)}`
                        : "sin mensajes aún"}
                    </p>
                  </div>
                </div>
                {ch.webhookUrl ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs">
                      {ch.webhookUrl}
                    </code>
                    <CopyButton text={ch.webhookUrl} label="Copiar webhook" />
                  </div>
                ) : null}
                {ch.missing.length ? (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    <p className="mb-1 font-medium">
                      Falta guardar como secreto (en tu terminal, dentro de apps/bot):
                    </p>
                    {ch.missing.map((name) => (
                      <code key={name} className="block">
                        npx wrangler secret put {name}
                      </code>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
          <Card className="mt-6 grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">Avisos al dueño</p>
              <p className="mt-1 text-sm text-slate-500">
                {data.notifications.length
                  ? `Activos por: ${data.notifications.join(" y ")}`
                  : "Sin configurar: agrega OWNER_TELEGRAM_CHAT_ID o RESEND_API_KEY + OWNER_EMAIL + EMAIL_FROM."}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Oído (notas de voz)</p>
              <p className="mt-1 text-sm text-slate-500">
                {data.transcription
                  ? "Activo con Whisper en Workers AI."
                  : "Se activa al desplegar en Cloudflare (Workers AI)."}
              </p>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
