import type { ConversationFilter, ConversationListItemDto, MessageDto } from "@yunque/core";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  cx,
  EmptyState,
  ErrorNote,
  Input,
  Select,
  Spinner,
  Textarea,
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { CHANNEL_LABEL, clockTime, pauseLabel, timeAgo } from "../lib/format.js";
import { useApi } from "../lib/hooks.js";

const FILTERS: Array<{ id: ConversationFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "needs_human", label: "Te necesitan" },
  { id: "unread", label: "Sin leer" },
  { id: "leads", label: "Interesados" },
];

function displayName(c: ConversationListItemDto): string {
  return c.contact.name ?? `Cliente ${c.contact.externalId.slice(-6)}`;
}

export function InboxPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.find((f) => f.id === params.get("filtro"))?.id ??
    "all") as ConversationFilter;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const list = useApi(() => api.conversations(filter, query), `${filter}|${query}`, 5000);

  return (
    <div className="flex h-full">
      <section
        className={cx(
          "flex w-full flex-col border-r border-slate-200 bg-white md:w-96",
          id && "hidden md:flex",
        )}
      >
        <div className="space-y-3 border-b border-slate-200 p-4">
          <h1 className="text-lg font-semibold">Bandeja</h1>
          <Input
            placeholder="Buscar por nombre o mensaje"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setParams(f.id === "all" ? {} : { filtro: f.id })}
                className={cx(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  filter === f.id
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ErrorNote message={list.error} />
          {list.loading && !list.data ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : list.data?.conversations.length === 0 ? (
            <EmptyState title="Sin conversaciones">
              Cuando alguien le escriba a tu bot, aparecerá aquí.
            </EmptyState>
          ) : (
            <ul>
              {list.data?.conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/bandeja/${c.id}${filter === "all" ? "" : `?filtro=${filter}`}`}
                    className={cx(
                      "block border-b border-slate-100 px-4 py-3 hover:bg-slate-50",
                      c.id === id && "bg-brand-50/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cx(
                          "truncate text-sm",
                          c.unread > 0 ? "font-semibold" : "font-medium",
                        )}
                      >
                        {displayName(c)}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {timeAgo(c.lastMessageAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {c.lastMessagePreview ?? "—"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge>{CHANNEL_LABEL[c.channel]}</Badge>
                      {c.needsHuman ? <Badge tone="amber">Te necesita</Badge> : null}
                      {c.pausedUntil ? <Badge tone="blue">Humano al mando</Badge> : null}
                      {c.isLead ? <Badge tone="green">Interesado</Badge> : null}
                      {c.unread > 0 ? <Badge tone="red">{c.unread}</Badge> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={cx("min-w-0 flex-1", !id && "hidden md:block")}>
        {id ? (
          <Thread key={id} id={id} onChanged={list.reload} />
        ) : (
          <EmptyState title="Elige una conversación">
            Desde aquí puedes tomar el chat, responder tú y devolvérselo al bot.
          </EmptyState>
        )}
      </section>
    </div>
  );
}

const ROLE_STYLE: Record<MessageDto["role"], string> = {
  user: "self-start bg-white ring-1 ring-slate-200",
  assistant: "self-end bg-brand-600 text-white",
  human: "self-end bg-emerald-600 text-white",
  note: "self-center bg-amber-50 text-amber-900 ring-1 ring-amber-200",
};

const ROLE_LABEL: Record<MessageDto["role"], string> = {
  user: "Cliente",
  assistant: "Bot",
  human: "Equipo",
  note: "Nota interna",
};

function Thread({ id, onChanged }: { id: string; onChanged: () => Promise<void> }) {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(() => api.conversation(id), id, 4000);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;

  useEffect(() => {
    if (count > 0) bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await Promise.all([reload(), onChanged()]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    await run(async () => {
      if (mode === "note") await api.note(id, value);
      else {
        const res = await api.reply(id, value);
        if (!res.delivered && res.deliveryError)
          throw new Error(`Se guardó, pero no se entregó: ${res.deliveryError}`);
      }
      setText("");
    });
  }

  if (loading && !data) {
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  }
  if (!data) return <ErrorNote message={error ?? "Conversación no encontrada"} />;

  const paused = data.pausedUntil !== null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
          onClick={() => navigate("/bandeja")}
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{displayName(data)}</p>
          <p className="text-xs text-slate-500">
            {CHANNEL_LABEL[data.channel]} ·{" "}
            {paused && data.pausedUntil ? pauseLabel(data.pausedUntil) : "bot activo"}
          </p>
        </div>
        {paused || data.needsHuman ? (
          <Button variant="secondary" disabled={busy} onClick={() => run(() => api.resume(id))}>
            Devolver al bot
          </Button>
        ) : (
          <Select
            className="w-auto"
            value=""
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value;
              if (v) void run(() => api.pause(id, v === "forever" ? null : Number(v)));
            }}
          >
            <option value="">Pausar bot…</option>
            <option value="30">30 minutos</option>
            <option value="60">1 hora</option>
            <option value="240">4 horas</option>
            <option value="480">8 horas</option>
            <option value="forever">Hasta reactivar</option>
          </Select>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {data.messages.map((m) => (
            <div
              key={m.id}
              className={cx("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", ROLE_STYLE[m.role])}
            >
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
              <MessageExtras meta={m.meta} />
              <p
                className={cx(
                  "mt-1 text-[11px]",
                  m.role === "user" || m.role === "note" ? "text-slate-400" : "text-white/70",
                )}
              >
                {ROLE_LABEL[m.role]} · {clockTime(m.createdAt)}
              </p>
            </div>
          ))}
          <div ref={bottom} />
        </div>
      </div>

      <form onSubmit={submit} className="space-y-2 border-t border-slate-200 bg-white p-3">
        <ErrorNote message={actionError} />
        <div className="flex gap-2 text-xs">
          {(["reply", "note"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cx(
                "rounded-full px-3 py-1 font-medium",
                mode === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600",
              )}
            >
              {m === "reply" ? "Responder al cliente" : "Nota interna"}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === "reply"
                ? "Escribe tu respuesta… (el bot se pausa mientras atiendes)"
                : "Solo la ve tu equipo"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button type="submit" disabled={busy || !text.trim()}>
            {mode === "reply" ? "Enviar" : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface ExtrasMeta {
  buttons?: string[];
  blocked?: { draft: string; unsupported: string[] };
  passages?: Array<{ title: string; score: number }>;
}

/** Lo que el dueño necesita ver de una respuesta del bot: botones, fuentes y frenos del Blindaje. */
function MessageExtras({ meta }: { meta: Record<string, unknown> | null }) {
  if (!meta) return null;
  const { buttons, blocked, passages } = meta as ExtrasMeta;
  return (
    <>
      {buttons?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {buttons.map((b) => (
            <span
              key={b}
              className="rounded-full bg-white/20 px-2 py-0.5 text-xs ring-1 ring-white/40"
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}
      {blocked ? (
        <div className="mt-2 rounded-lg bg-white/15 p-2 text-xs">
          <p className="font-semibold">🛡 Blindaje frenó esta respuesta</p>
          <p className="mt-1 opacity-90">Iba a decir: «{blocked.draft}»</p>
          <p className="mt-1 opacity-90">Sin respaldo: {blocked.unsupported.join(", ")}</p>
        </div>
      ) : null}
      {passages?.length ? (
        <p className="mt-1 text-[11px] opacity-80">
          Fuentes: {passages.map((p) => `${p.title} (${p.score.toFixed(2)})`).join(" · ")}
        </p>
      ) : null}
    </>
  );
}
