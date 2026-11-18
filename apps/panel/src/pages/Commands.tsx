import { CopyButton } from "../components/CopyButton.js";
import { Card, PageHeader } from "../components/ui.js";
import { COMMAND_GROUPS } from "../lib/catalog.js";

export function CommandsPage() {
  const total = COMMAND_GROUPS.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Comandos"
        description={`${total} comandos para operar tu bot. Los de terminal se corren en la raíz del repo; los que empiezan con / son agentes: copia el prompt y pégalo en Claude Code dentro de este repo.`}
      />
      <div className="space-y-6">
        {COMMAND_GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {group.title}
            </h2>
            <p className="mb-2 text-xs text-slate-400">{group.hint}</p>
            <Card className="divide-y divide-slate-100">
              {group.items.map((item) => (
                <div
                  key={item.command}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <code className="text-sm font-semibold text-slate-800">{item.command}</code>
                    <p className="text-sm text-slate-500">{item.description}</p>
                  </div>
                  <CopyButton
                    text={item.prompt}
                    label={item.command.startsWith("/") ? "Copiar prompt" : "Copiar"}
                  />
                </div>
              ))}
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}
