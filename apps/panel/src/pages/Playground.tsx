import type { PlaygroundReplyDto } from "@yunque/core";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button, Card, cx, ErrorNote, Input, PageHeader } from "../components/ui.js";
import { api } from "../lib/api.js";

type Line =
  | { who: "you"; text: string }
  | { who: "bot"; text: string; buttons: string[] }
  | { who: "system"; text: string };

function newSession(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

/** Traduce la respuesta de prueba a líneas del chat, con las notas que ayudan al dueño a entenderla. */
function toLines(res: PlaygroundReplyDto): Line[] {
  const lines: Line[] = [];
  if (res.blocked) {
    lines.push({
      who: "system",
      text: `🛡 Blindaje frenó: «${res.blocked.draft}» — sin respaldo: ${res.blocked.unsupported.join(", ")}`,
    });
  }
  lines.push(
    res.reply
      ? { who: "bot", text: res.reply, buttons: res.buttons }
      : { who: "system", text: "El bot no respondió (pausado o apagado)." },
  );
  if (res.handoff)
    lines.push({ who: "system", text: "↪ Pasó la conversación a una persona (revisa Tickets)." });
  const notes = [
    res.model ? `modelo: ${res.model}` : null,
    res.passages.length
      ? `fuentes: ${res.passages.map((p) => `${p.title} (${p.score.toFixed(2)})`).join(", ")}`
      : null,
  ].filter(Boolean);
  if (notes.length) lines.push({ who: "system", text: notes.join(" · ") });
  return lines;
}

export function PlaygroundPage() {
  const [session, setSession] = useState(newSession);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const count = lines.length;

  useEffect(() => {
    if (count > 0) bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function send(value: string) {
    const message = value.trim();
    if (!message) return;
    setText("");
    setError(null);
    setLines((l) => [...l, { who: "you", text: message }]);
    setBusy(true);
    try {
      const res = await api.playground(session, message);
      setLines((l) => [...l, ...toLines(res)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al probar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-6">
      <PageHeader
        title="Probar bot"
        description="Habla con tu bot como si fueras un cliente. Usa tu configuración real y queda registrado en la Bandeja como canal «Prueba»."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setSession(newSession());
              setLines([]);
            }}
          >
            Nueva conversación
          </Button>
        }
      />
      <Card className="flex min-h-[420px] flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
          {lines.length === 0 ? (
            <p className="text-center text-sm text-slate-400">Escribe un mensaje para empezar.</p>
          ) : null}
          {lines.map((l, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: la lista solo crece
              key={i}
              className={cx(
                "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                l.who === "you" && "ml-auto bg-brand-600 text-white",
                l.who === "bot" && "bg-white ring-1 ring-slate-200",
                l.who === "system" && "mx-auto bg-transparent text-center text-xs text-slate-400",
              )}
            >
              {l.text}
              {l.who === "bot" && l.buttons.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {l.buttons.map((b) => (
                    <button
                      key={b}
                      type="button"
                      disabled={busy}
                      onClick={() => void send(b)}
                      className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {busy ? <p className="text-sm text-slate-400">Escribiendo…</p> : null}
          <div ref={bottom} />
        </div>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void send(text);
          }}
          className="flex gap-2 border-t border-slate-200 p-3"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="¿A qué hora abren?"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !text.trim()}>
            Enviar
          </Button>
        </form>
      </Card>
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>
    </div>
  );
}
