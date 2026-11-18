import { type ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import { cx } from "./ui.js";

const NAV = [
  { to: "/", label: "Resumen", icon: "◧", end: true },
  { to: "/bandeja", label: "Bandeja", icon: "✉", end: false },
  { to: "/clientes", label: "Clientes", icon: "☺", end: false },
  { to: "/tickets", label: "Tickets", icon: "⚑", end: false },
  { to: "/conocimiento", label: "Conocimiento", icon: "▤", end: false },
  { to: "/mejoras", label: "Mejoras", icon: "✦", end: false },
  { to: "/probar", label: "Probar bot", icon: "▶", end: false },
  { to: "/configuracion", label: "Configuración", icon: "⚙", end: false },
];

export function Layout({
  botName,
  onLogout,
  children,
}: {
  botName: string;
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
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            {botName.slice(0, 1).toUpperCase() || "B"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{botName}</p>
            <p className="text-xs text-slate-500">Panel del bot</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
                )
              }
            >
              <span aria-hidden className="w-4 text-center">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
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
