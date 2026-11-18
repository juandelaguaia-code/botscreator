import {
  type BotSettings,
  type BusinessProfile,
  LANGUAGES,
  type Language,
  MODEL_MODES,
  type ModelMode,
  type Offering,
  type ProviderId,
  TONES,
  type Tone,
} from "@yunque/core";
import { type ReactNode, useEffect, useState } from "react";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { useApi, useRowKeys } from "../lib/hooks.js";

const TONE_LABEL: Record<Tone, string> = {
  cercano: "Cercano",
  formal: "Formal",
  divertido: "Divertido",
};
const LANGUAGE_LABEL: Record<Language, string> = {
  "es-419": "Español (Latinoamérica)",
  "es-ES": "Español (España)",
  en: "English",
  "pt-BR": "Português (Brasil)",
  espejo: "Espejo: el idioma de cada cliente",
};
const MODE_LABEL: Record<ModelMode, string> = {
  economico: "Económico — siempre el modelo rápido",
  equilibrado: "Equilibrado — rápido en lo simple, sube solo en lo difícil",
  maximo: "Máximo — siempre el más capaz",
};
const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  xai: "Grok (xAI)",
  gemini: "Gemini (Google)",
  fake: "Modo prueba (sin IA)",
};
const INSTRUCTIONS_MAX = 16_000;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-6">
      <h2 className="font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      <div className="mt-5 space-y-4">{children}</div>
    </Card>
  );
}

export function SettingsPage({ onSaved }: { onSaved: () => void }) {
  const { data, error, loading } = useApi(() => api.settings(), "settings");
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const offeringKeys = useRowKeys();
  const faqKeys = useRowKeys();
  const resetOfferingKeys = offeringKeys.reset;
  const resetFaqKeys = faqKeys.reset;

  useEffect(() => {
    if (data) {
      setProfile(data.profile);
      setSettings(data.settings);
      resetOfferingKeys(data.profile.offerings.length);
      resetFaqKeys(data.profile.faq.length);
    }
  }, [data, resetOfferingKeys, resetFaqKeys]);

  if (loading && !data)
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  if (!profile || !settings || !data)
    return (
      <div className="p-6">
        <ErrorNote message={error ?? "No se pudo cargar"} />
      </div>
    );

  const p = (patch: Partial<BusinessProfile>) => setProfile({ ...profile, ...patch });
  const s = (patch: Partial<BotSettings>) => setSettings({ ...settings, ...patch });
  const providers = Array.from(
    new Set<ProviderId>([...(data.configuredProviders as ProviderId[]), settings.provider]),
  );

  async function save() {
    if (!profile || !settings) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.saveSettings({ profile, settings });
      setProfile(res.profile);
      setSettings(res.settings);
      setSavedAt(Date.now());
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const updateOffering = (i: number, patch: Partial<Offering>) =>
    p({ offerings: profile.offerings.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  return (
    <div className="mx-auto max-w-4xl p-6 pb-28">
      <PageHeader
        title="Configuración"
        description="El cerebro de tu bot. Cada dato vive en su campo y se aplica al siguiente mensaje, sin volver a desplegar."
      />

      <div className="space-y-6">
        <Section
          title="Tu negocio"
          description="La única fuente de verdad del bot: lo que no esté aquí, no lo afirma."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del negocio">
              <Input value={profile.name} onChange={(e) => p({ name: e.target.value })} />
            </Field>
            <Field label="Teléfono / WhatsApp">
              <Input value={profile.phone} onChange={(e) => p({ phone: e.target.value })} />
            </Field>
          </div>
          <Field label="¿A qué se dedica?">
            <Textarea
              rows={2}
              value={profile.description}
              onChange={(e) => p({ description: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Horario" hint="Ej.: L-V 9:00-19:00, S 10:00-14:00">
              <Input value={profile.hours} onChange={(e) => p({ hours: e.target.value })} />
            </Field>
            <Field label="Zona horaria" hint="Formato IANA, ej.: America/Santiago">
              <Input value={profile.timezone} onChange={(e) => p({ timezone: e.target.value })} />
            </Field>
            <Field label="Ubicación">
              <Input value={profile.location} onChange={(e) => p({ location: e.target.value })} />
            </Field>
            <Field label="Sitio web o redes">
              <Input value={profile.website} onChange={(e) => p({ website: e.target.value })} />
            </Field>
          </div>
          <Field label="Métodos de pago" hint="Separados por coma">
            <Input
              value={profile.paymentMethods.join(", ")}
              onChange={(e) =>
                p({
                  paymentMethods: e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field
            label="Promoción vigente"
            hint="El bot la menciona cuando viene al caso. Déjalo vacío si no hay."
          >
            <Input value={profile.promotion} onChange={(e) => p({ promotion: e.target.value })} />
          </Field>
        </Section>

        <Section title="Productos y servicios" description="Con precio, y duración si se agenda.">
          {profile.offerings.map((o, i) => (
            <div
              key={offeringKeys.keys[i] ?? i}
              className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
            >
              <Input
                placeholder="Nombre"
                value={o.name}
                onChange={(e) => updateOffering(i, { name: e.target.value })}
              />
              <Input
                placeholder="Precio"
                value={o.price ?? ""}
                onChange={(e) => updateOffering(i, { price: e.target.value || undefined })}
              />
              <Input
                placeholder="Minutos"
                type="number"
                min={1}
                value={o.durationMinutes ?? ""}
                onChange={(e) =>
                  updateOffering(i, {
                    durationMinutes: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              <Button
                variant="ghost"
                onClick={() => {
                  offeringKeys.remove(i);
                  p({ offerings: profile.offerings.filter((_, j) => j !== i) });
                }}
              >
                Quitar
              </Button>
              <Input
                className="sm:col-span-3"
                placeholder="Descripción (opcional)"
                value={o.description ?? ""}
                onChange={(e) => updateOffering(i, { description: e.target.value || undefined })}
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(o.bookable)}
                  onChange={(e) => updateOffering(i, { bookable: e.target.checked })}
                />
                Se agenda
              </label>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => {
              offeringKeys.add();
              p({ offerings: [...profile.offerings, { name: "" }] });
            }}
          >
            + Agregar producto o servicio
          </Button>
        </Section>

        <Section
          title="Preguntas frecuentes"
          description="Lo que más te pregunta la gente, con tu respuesta."
        >
          {profile.faq.map((f, i) => (
            <div key={faqKeys.keys[i] ?? i} className="space-y-2 rounded-lg bg-slate-50 p-3">
              <Input
                placeholder="Pregunta"
                value={f.question}
                onChange={(e) =>
                  p({
                    faq: profile.faq.map((x, j) =>
                      j === i ? { ...x, question: e.target.value } : x,
                    ),
                  })
                }
              />
              <Textarea
                rows={2}
                placeholder="Respuesta"
                value={f.answer}
                onChange={(e) =>
                  p({
                    faq: profile.faq.map((x, j) =>
                      j === i ? { ...x, answer: e.target.value } : x,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                onClick={() => {
                  faqKeys.remove(i);
                  p({ faq: profile.faq.filter((_, j) => j !== i) });
                }}
              >
                Quitar
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => {
              faqKeys.add();
              p({ faq: [...profile.faq, { question: "", answer: "" }] });
            }}
          >
            + Agregar pregunta
          </Button>
        </Section>

        <Section
          title="Instrucciones del bot"
          description="Reglas de comportamiento: qué no debe hacer, cuándo pasarte la conversación, cómo cerrar una venta. Nunca anulan los frenos de seguridad."
        >
          <Textarea
            rows={8}
            maxLength={INSTRUCTIONS_MAX}
            value={profile.instructions}
            onChange={(e) => p({ instructions: e.target.value })}
            placeholder="Ej.: No prometas tiempos de entrega. Si piden factura, pasa la conversación a una persona."
          />
          <p className="text-right text-xs text-slate-400">
            {profile.instructions.length.toLocaleString("es")} /{" "}
            {INSTRUCTIONS_MAX.toLocaleString("es")}
          </p>
        </Section>

        <Section title="Voz e idioma">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tono">
              <Select value={profile.tone} onChange={(e) => p({ tone: e.target.value as Tone })}>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Idioma">
              <Select
                value={profile.language}
                onChange={(e) => p({ language: e.target.value as Language })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABEL[l]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Moneda">
              <Input
                value={profile.currency}
                maxLength={5}
                onChange={(e) => p({ currency: e.target.value })}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Cerebro de IA"
          description="Las llaves se guardan como secretos de Cloudflare; aquí solo eliges cuál usar."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Proveedor"
              hint={
                providers.length === 1
                  ? "Agrega otra llave como secreto para ver más opciones."
                  : undefined
              }
            >
              <Select
                value={settings.provider}
                onChange={(e) => s({ provider: e.target.value as ProviderId })}
              >
                {providers.map((id) => (
                  <option key={id} value={id}>
                    {PROVIDER_LABEL[id]}
                    {data.configuredProviders.includes(id) ? "" : " — falta la llave"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nivel">
              <Select
                value={settings.modelMode}
                onChange={(e) => s({ modelMode: e.target.value as ModelMode })}
              >
                {MODEL_MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-slate-600">
              Elegir modelos exactos (avanzado)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(["fast", "smart", "max"] as const).map((tier) => (
                <Field
                  key={tier}
                  label={{ fast: "Rápido", smart: "Inteligente", max: "Máximo" }[tier]}
                >
                  <Input
                    placeholder="default del proveedor"
                    value={settings.models[tier] ?? ""}
                    onChange={(e) =>
                      s({ models: { ...settings.models, [tier]: e.target.value || undefined } })
                    }
                  />
                </Field>
              ))}
            </div>
          </details>
        </Section>

        <Section
          title="Blindaje anti-invento"
          description="Lo que no sabe, no lo inventa: busca en tu base de conocimiento y revisa cada dato antes de enviarlo."
        >
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">Verificar antes de enviar</span>
              <span className="block text-xs text-slate-500">
                Si una respuesta trae un precio, horario o promesa que no está en tu información, el
                bot dice «déjame confirmarlo» y te pasa la conversación.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.verifierEnabled}
              onChange={(e) => s({ verifierEnabled: e.target.checked })}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Umbral de confianza"
              hint={`Vacío = automático (${data.knowledge.recommendedMinScore} con el motor actual). Más alto = más estricto.`}
            >
              <Input
                type="number"
                min={0.1}
                max={0.99}
                step={0.05}
                placeholder={String(data.knowledge.recommendedMinScore)}
                value={settings.kbMinScore ?? ""}
                onChange={(e) => s({ kbMinScore: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
            <Field label="Pasajes que consulta por mensaje">
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.kbTopK}
                onChange={(e) => s({ kbTopK: Number(e.target.value) })}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Botones tocables"
          description="En elecciones cerradas (confirmar una cita, elegir un servicio) el bot ofrece hasta 3 opciones para tocar."
        >
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Activar botones</span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.buttonsEnabled}
              onChange={(e) => s({ buttonsEnabled: e.target.checked })}
            />
          </label>
        </Section>

        <Section
          title="Superpoderes automáticos"
          description="Corren solos cada 15 minutos. Los mensajes que inicia el bot respetan sus garantías: un solo seguimiento por conversación y nunca si un humano tiene el chat."
        >
          {(
            [
              [
                "vigilante",
                "Vigilante",
                "Califica cada conversación terminada y te avisa si un cliente quedó molesto o una venta peligra.",
              ],
              [
                "hunter",
                "Cazador de ventas",
                "Un solo seguimiento a chats enfriados entre 3 y 20 h después.",
              ],
              [
                "surveys",
                "Encuestas de satisfacción",
                "Pide una calificación del 1 al 5 al cerrar una atención resuelta.",
              ],
              [
                "noShows",
                "Recupera no-shows",
                "Segundo intento a interesados que se enfriaron hace días.",
              ],
              [
                "reviews",
                "Pide reseñas",
                "Invita a dejar reseña a quien quedó contento (requiere tu link abajo).",
              ],
              [
                "reminders",
                "Recordatorio de cita",
                "Avisa ~24 h antes de cada cita agendada por el bot.",
              ],
              [
                "dailyReport",
                "Reporte nocturno",
                "Te manda el resumen del día por Telegram o correo.",
              ],
            ] as const
          ).map(([key, label, hint]) => (
            <label key={key} className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={settings.automation[key]}
                onChange={(e) =>
                  s({ automation: { ...settings.automation, [key]: e.target.checked } })
                }
              />
            </label>
          ))}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Máximo de seguimientos por día">
              <Input
                type="number"
                min={1}
                max={200}
                value={settings.automation.hunterDailyMax}
                onChange={(e) =>
                  s({
                    automation: { ...settings.automation, hunterDailyMax: Number(e.target.value) },
                  })
                }
              />
            </Field>
            <Field label="No-shows: días después">
              <Input
                type="number"
                min={1}
                max={30}
                value={settings.automation.noShowAfterDays}
                onChange={(e) =>
                  s({
                    automation: { ...settings.automation, noShowAfterDays: Number(e.target.value) },
                  })
                }
              />
            </Field>
            <Field label="Hora del reporte (0–23)">
              <Input
                type="number"
                min={0}
                max={23}
                value={settings.automation.dailyReportHour}
                onChange={(e) =>
                  s({
                    automation: { ...settings.automation, dailyReportHour: Number(e.target.value) },
                  })
                }
              />
            </Field>
          </div>
          <Field
            label="Link para dejar reseña"
            hint="Google Maps u otro. Sin link, el bot no pide reseñas."
          >
            <Input
              type="url"
              placeholder="https://g.page/r/…/review"
              value={profile.reviewUrl}
              onChange={(e) => p({ reviewUrl: e.target.value })}
            />
          </Field>
          <Field
            label="Tope de gasto de IA por mes (USD)"
            hint="Al llegar, el bot deja de usar IA y te pasa las conversaciones. Vacío = sin tope."
          >
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={settings.monthlyBudgetUsd ?? ""}
              onChange={(e) =>
                s({ monthlyBudgetUsd: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Field>
        </Section>

        <Section
          title="Agenda y cobros"
          description="Las llaves van como secretos: CALCOM_API_KEY para la agenda; STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET para cobrar."
        >
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Agendar citas en Cal.com</span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.booking.enabled}
              onChange={(e) => s({ booking: { ...settings.booking, enabled: e.target.checked } })}
            />
          </label>
          <Field
            label="Id del tipo de evento en Cal.com"
            hint="Lo ves en la URL del evento en tu Cal.com."
          >
            <Input
              type="number"
              min={1}
              value={settings.booking.eventTypeId ?? ""}
              onChange={(e) =>
                s({
                  booking: {
                    ...settings.booking,
                    eventTypeId: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
            />
          </Field>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Cobrar con links de pago de Stripe</span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.payments.enabled}
              onChange={(e) => s({ payments: { ...settings.payments, enabled: e.target.checked } })}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Moneda (ISO)" hint="clp, mxn, usd, eur…">
              <Input
                maxLength={3}
                value={settings.payments.currency}
                onChange={(e) =>
                  s({ payments: { ...settings.payments, currency: e.target.value.toLowerCase() } })
                }
              />
            </Field>
            <Field label="Monto máximo por link" hint="Vacío = sin tope.">
              <Input
                type="number"
                min={1}
                value={settings.payments.maxAmount ?? ""}
                onChange={(e) =>
                  s({
                    payments: {
                      ...settings.payments,
                      maxAmount: e.target.value ? Number(e.target.value) : null,
                    },
                  })
                }
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Plantillas de WhatsApp"
          description="Para escribir fuera de las 24 h desde el último mensaje del cliente, Meta exige una plantilla aprobada. Escribe su nombre e idioma (p. ej. es_MX). Con Twilio, el nombre es el ContentSid."
        >
          {(
            [
              ["reminder", "Recordatorio de cita"],
              ["noShow", "Recupera no-shows"],
              ["campaign", "Campañas"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
              <p className="self-center text-sm font-medium">{label}</p>
              <Input
                placeholder="nombre_de_la_plantilla"
                value={settings.whatsappTemplates[key]?.name ?? ""}
                onChange={(e) =>
                  s({
                    whatsappTemplates: {
                      ...settings.whatsappTemplates,
                      [key]: e.target.value
                        ? {
                            name: e.target.value,
                            language: settings.whatsappTemplates[key]?.language ?? "es",
                          }
                        : undefined,
                    },
                  })
                }
              />
              <Input
                placeholder="es"
                value={settings.whatsappTemplates[key]?.language ?? ""}
                disabled={!settings.whatsappTemplates[key]}
                onChange={(e) => {
                  const current = settings.whatsappTemplates[key];
                  if (current)
                    s({
                      whatsappTemplates: {
                        ...settings.whatsappTemplates,
                        [key]: { ...current, language: e.target.value },
                      },
                    });
                }}
              />
            </div>
          ))}
        </Section>

        <Section title="Comportamiento">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">Bot encendido</span>
              <span className="block text-xs text-slate-500">
                Apagado, nadie recibe respuesta automática (los mensajes se guardan igual).
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.enabled}
              onChange={(e) => s({ enabled: e.target.checked })}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minutos que el bot se aparta al responder tú">
              <Input
                type="number"
                min={5}
                max={1440}
                value={settings.takeoverMinutes}
                onChange={(e) => s({ takeoverMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Máximo de mensajes por cliente en 10 min">
              <Input
                type="number"
                min={5}
                max={500}
                value={settings.rateLimitPer10Min}
                onChange={(e) => s({ rateLimitPer10Min: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field
            label="Sitios donde se permite el chat web"
            hint="Uno por línea, con https://. Vacío = cualquier sitio."
          >
            <Textarea
              rows={3}
              value={settings.widgetAllowedOrigins.join("\n")}
              onChange={(e) =>
                s({
                  widgetAllowedOrigins: e.target.value
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/90 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-4xl items-center justify-end gap-3 px-6 py-3">
          <ErrorNote message={saveError} />
          {savedAt && !saveError ? (
            <span className="text-sm text-emerald-700">Guardado ✓</span>
          ) : null}
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}
