import type { KbDocumentDto, KbSearchResultDto } from "@yunque/core";
import { type FormEvent, useState } from "react";
import {
  Badge,
  Button,
  Card,
  cx,
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

type Editor = { mode: "new" } | { mode: "edit"; id: string } | null;

export function KnowledgePage() {
  const { data, error, loading, reload } = useApi(() => api.kb(), "kb");
  const [editor, setEditor] = useState<Editor>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      await reload();
      if (success) setNotice(success);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setBusy(false);
    }
  }

  const docs = data?.documents ?? [];
  const stale = docs.some((d) => d.stale);
  const engine = data?.engine;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Base de conocimiento"
        description="Documentos que el bot consulta antes de afirmar algo: políticas, catálogo, preguntas largas. Solo usa pasajes que superan el umbral de confianza."
        actions={
          <Button onClick={() => setEditor({ mode: "new" })} disabled={busy}>
            + Nuevo documento
          </Button>
        }
      />

      {engine ? (
        <p className="mb-4 text-xs text-slate-500">
          Motor: <span className="font-medium">{engine.embedder}</span> ·{" "}
          {engine.index === "vectorize" ? "Vectorize" : "índice local (desarrollo)"} · umbral
          recomendado {engine.recommendedMinScore}
        </p>
      ) : null}

      <div className="space-y-3">
        <ErrorNote message={error ?? actionError} />
        {notice ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
        ) : null}
        {stale ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              Hay documentos indexados con otro motor. Reindexa para que el bot los vuelva a
              encontrar.
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => api.kbReindex(), "Reindexado.")}
            >
              Reindexar todo
            </Button>
          </Card>
        ) : null}
      </div>

      {editor ? (
        <DocumentEditor
          key={editor.mode === "edit" ? editor.id : "new"}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={async (message) => {
            setEditor(null);
            setNotice(message);
            await reload();
          }}
        />
      ) : null}

      <Card className="mt-6 p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(async () => {
              await api.kbImportUrl(url.trim());
              setUrl("");
            }, "Página importada.");
          }}
        >
          <div className="min-w-64 flex-1">
            <Field
              label="Importar desde tu página web"
              hint="Copia el texto de una página (servicios, preguntas frecuentes, políticas)."
            >
              <Input
                type="url"
                placeholder="https://tunegocio.com/servicios"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={busy || !url.trim()}>
            Importar
          </Button>
        </form>
      </Card>

      <div className="mt-6">
        {loading && !data ? (
          <Spinner />
        ) : docs.length === 0 ? (
          <Card>
            <EmptyState title="Aún no hay documentos">
              Agrega tus políticas, catálogo o preguntas largas. El bot responde con esto y con la
              información de Configuración.
            </EmptyState>
          </Card>
        ) : (
          <Card className="divide-y divide-slate-100">
            {docs.map((d) => (
              <DocumentRow
                key={d.id}
                doc={d}
                busy={busy}
                onEdit={() => setEditor({ mode: "edit", id: d.id })}
                onDelete={() => {
                  if (window.confirm(`¿Borrar «${d.title}»? El bot dejará de usarlo.`)) {
                    void run(() => api.kbDelete(d.id), "Documento borrado.");
                  }
                }}
              />
            ))}
          </Card>
        )}
      </div>

      <SearchTester />
    </div>
  );
}

function DocumentRow({
  doc,
  busy,
  onEdit,
  onDelete,
}: {
  doc: KbDocumentDto;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{doc.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {doc.status === "error" ? (
            <Badge tone="red">Error</Badge>
          ) : (
            <Badge tone="green">Listo</Badge>
          )}
          {doc.stale ? <Badge tone="amber">Reindexar</Badge> : null}
          <Badge>{doc.source === "url" ? "Web" : "Manual"}</Badge>
          <span>
            {doc.chunkCount} pasajes · {doc.chars.toLocaleString("es")} caracteres ·{" "}
            {dateTime(doc.updatedAt)}
          </span>
        </div>
        {doc.error ? <p className="mt-1 text-xs text-red-600">{doc.error}</p> : null}
        {doc.sourceUrl ? (
          <p className="mt-1 truncate text-xs text-slate-400">{doc.sourceUrl}</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={busy} onClick={onEdit}>
          Editar
        </Button>
        <Button variant="danger" disabled={busy} onClick={onDelete}>
          Borrar
        </Button>
      </div>
    </div>
  );
}

function DocumentEditor({
  editor,
  onClose,
  onSaved,
}: {
  editor: Exclude<Editor, null>;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const editingId = editor.mode === "edit" ? editor.id : null;
  const existing = useApi(
    () => (editingId ? api.kbDocument(editingId) : Promise.resolve(null)),
    editingId ?? "new",
  );
  const [title, setTitle] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTitle = title ?? existing.data?.title ?? "";
  const currentContent = content ?? existing.data?.content ?? "";

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingId) await api.kbUpdate(editingId, currentTitle, currentContent);
      else await api.kbCreate(currentTitle, currentContent);
      await onSaved(editingId ? "Documento actualizado." : "Documento agregado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (editingId && existing.loading && !existing.data) {
    return (
      <Card className="mt-6 p-6">
        <Spinner />
      </Card>
    );
  }

  return (
    <Card className="mt-6 p-6">
      <form onSubmit={save} className="space-y-4">
        <h2 className="font-semibold">{editingId ? "Editar documento" : "Nuevo documento"}</h2>
        <Field label="Título">
          <Input
            value={currentTitle}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Políticas de cancelación"
          />
        </Field>
        <Field
          label="Contenido"
          hint="Texto claro, con un tema por párrafo. Máximo 100.000 caracteres."
        >
          <Textarea
            rows={12}
            maxLength={100_000}
            value={currentContent}
            onChange={(e) => setContent(e.target.value)}
          />
        </Field>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !currentTitle.trim() || !currentContent.trim()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SearchTester() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<KbSearchResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await api.kbSearch(query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo buscar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="font-semibold">Probar la búsqueda</h2>
      <p className="mt-1 text-sm text-slate-500">
        Escribe una pregunta como la haría un cliente y mira qué pasajes encuentra el bot y si
        superan el umbral.
      </p>
      <form onSubmit={search} className="mt-4 flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="¿Puedo cancelar mi cita?"
        />
        <Button type="submit" disabled={busy || !query.trim()}>
          Buscar
        </Button>
      </form>
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>
      {result ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-500">Umbral de confianza: {result.minScore}</p>
          {result.results.length === 0 ? (
            <p className="text-sm text-slate-500">
              Sin resultados. El bot diría que lo confirma con el equipo.
            </p>
          ) : (
            result.results.map((r, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: resultados de solo lectura
                key={i}
                className={cx(
                  "rounded-lg p-3 ring-1",
                  r.passes ? "bg-emerald-50/50 ring-emerald-200" : "bg-slate-50 ring-slate-200",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">{r.title}</span>
                  <Badge tone={r.passes ? "green" : "slate"}>
                    {r.score.toFixed(2)} · {r.passes ? "lo usaría" : "no confía"}
                  </Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.text}</p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </Card>
  );
}
