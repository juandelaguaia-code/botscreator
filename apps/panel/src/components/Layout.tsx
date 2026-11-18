import { type ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import { cx } from "./ui.js";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

export const NAV: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Operación",
    items: [
      { to: "/", label: "Resumen", icon: "◧", end: true },
      { to: "/bandeja", label: "Bandeja", icon: "✉" },
      { to: "/clientes", label: "Clientes", icon: "☺" },
      { to: "/tickets", label: "Tickets", icon: "⚑" },
      { to: "/agenda", label: "Agenda y cobros", icon: "◷" },
    ],
  },
  {
    title: "Crecimiento",
    items: [
      { to: "/analista", label: "Analista", icon: "◎" },
      { to: "/estadisticas", label: "Estadísticas", icon: "▥" },
      { to: "/costos", label: "Costos", icon: "$" },
      { to: "/campanas", label: "Campañas", icon: "➤" },
      { to: "/mejoras", label: "Mejoras", icon: "✦" },
    ],
  },
  {
    title: "Contenido",
    items: [
      { to: "/conocimiento", label: "Conocimiento", icon: "▤" },
      { to: "/galeria", label: "Galería", icon: "▣" },
    ],
  },
  {
    title: "Bot",
    items: [
      { to: "/superpoderes", label: "Superpoderes", icon: "⚡" },
      { to: "/prompt", label: "Prompt", icon: "✎" },
      { to: "/conexiones", label: "Conexiones", icon: "⇄" },
      { to: "/probar", label: "Probar bot", icon: "▶" },
      { to: "/comandos", label: "Comandos", icon: "⌘" },
      { to: "/agencia", label: "Modo agencia", icon: "◈" },
      { to: "/equipo", label: "Equipo", icon: "☷" },
      { to: "/configuracion", label: "Configuración", icon: "⚙" },
    ],
  },
];

const ROLE_LABEL = { owner: "Dueño", admin: "Administrador", team: "Equipo" } as const;

export function Layout({
  botName,
  logoUrl,
  allowedTabs = null,
  actor = null,
  onLogout,
  children,
}: {
  botName: string;
  logoUrl?: string | null;
  /** Pestañas visibles para este acceso; `null` = todas. */
  allowedTabs?: string[] | null;
  actor?: { name: string; role: keyof typeof ROLE_LABEL } | null;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-full">
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              {botName.slice(0, 1).toUpperCase() || "B"}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{botName}</p>
            <p className="text-xs text-slate-500">Panel del bot</p>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {NAV.map((group) => {
            const items = group.items.filter((i) => !allowedTabs || allowedTabs.includes(i.to));
            if (items.length === 0) return null;
            return (
              <div key={group.title}>
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end ?? false}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cx(
                          "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium",
                          isActive
                            ? "bg-brand-50 text-brand-700"
                            : "text-slate-600 hover:bg-slate-100",
                        )
                      }
                    >
                      <span aria-hidden className="w-4 text-center">
                        {item.icon}
                      </span>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          {actor ? (
            <p className="truncate px-3 pb-2 text-xs text-slate-500">
              {actor.role === "owner"
                ? "Dueño · contraseña maestra"
                : `${actor.name} · ${ROLE_LABEL[actor.role]}`}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-20 bg-slate-900/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-slate-100"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="truncate text-sm font-semibold">{botName}</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
