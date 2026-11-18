import { type BotSettings, BRAND_FONTS } from "@yunque/core";
import { useState } from "react";
import { api } from "../lib/api.js";
import { NAV } from "./Layout.js";
import { Button, ErrorNote, Field, Input, Select } from "./ui.js";

type Branding = BotSettings["branding"];

const STYLES: Array<{ id: Branding["style"]; label: string; hint: string }> = [
  { id: "nimbus", label: "Nimbus", hint: "Claro y limpio (por defecto)" },
  { id: "onyx", label: "Onyx", hint: "Oscuro moderno" },
  { id: "terra", label: "Terra", hint: "Cálido editorial" },
];

/** Configuración sigue visible para que el Administrador nunca se quede afuera. */
const HIDEABLE = NAV.flatMap((g) => g.items).filter((i) => i.to !== "/configuracion");

/** Marca blanca del panel: nombre, logo, color, estilo, tipografía, textos del login y pestañas. */
export function BrandingSection({
  branding,
  onChange,
}: {
  branding: Branding;
  onChange: (patch: Partial<Branding>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { logoUrl } = await api.uploadLogo(form);
      onChange({ logoUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el logo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del panel" hint="Vacío = el nombre del negocio.">
          <Input
            value={branding.panelName}
            maxLength={60}
            onChange={(e) => onChange({ panelName: e.target.value })}
          />
        </Field>
        <Field label="Color de acento" hint="Vacío = el color del estilo.">
          <div className="flex gap-2">
            <input
              type="color"
              aria-label="Elegir color"
              className="h-9 w-12 cursor-pointer rounded-lg ring-1 ring-slate-200"
              value={branding.accentColor || "#2563eb"}
              onChange={(e) => onChange({ accentColor: e.target.value })}
            />
            <Input
              value={branding.accentColor}
              placeholder="#1f8a5b"
              onChange={(e) => onChange({ accentColor: e.target.value.trim() })}
            />
          </div>
        </Field>
      </div>

      <Field label="Logo" hint="PNG, JPG, WEBP o SVG de hasta 1 MB. También puedes pegar una URL.">
        <div className="flex flex-wrap items-center gap-3">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt="Logo actual"
              className="h-10 w-10 rounded-lg object-contain ring-1 ring-slate-200"
            />
          ) : null}
          <Input
            className="min-w-0 flex-1"
            value={branding.logoUrl}
            placeholder="https://…/logo.png"
            onChange={(e) => onChange({ logoUrl: e.target.value })}
          />
          <label className="cursor-pointer rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            {uploading ? "Subiendo…" : "Subir archivo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </label>
          {branding.logoUrl ? (
            <Button variant="ghost" onClick={() => onChange({ logoUrl: "" })}>
              Quitar
            </Button>
          ) : null}
        </div>
      </Field>
      <ErrorNote message={error} />

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">Estilo</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {STYLES.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => onChange({ style: st.id })}
              className={`rounded-lg p-3 text-left ring-1 ${
                branding.style === st.id
                  ? "bg-brand-50 ring-2 ring-brand-600"
                  : "bg-white ring-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="block text-sm font-medium">{st.label}</span>
              <span className="block text-xs text-slate-500">{st.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipografía" hint="Se carga de Google Fonts.">
          <Select
            value={branding.font}
            onChange={(e) => onChange({ font: e.target.value as Branding["font"] })}
          >
            {BRAND_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Título del login" hint="Vacío = el nombre del panel.">
          <Input
            value={branding.loginTitle}
            maxLength={80}
            onChange={(e) => onChange({ loginTitle: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Subtítulo del login">
        <Input
          value={branding.loginSubtitle}
          maxLength={160}
          placeholder="Entra con tu correo y contraseña."
          onChange={(e) => onChange({ loginSubtitle: e.target.value })}
        />
      </Field>

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">Pestañas ocultas</span>
        <p className="mb-2 text-xs text-slate-500">
          No las ven los accesos personales (Administrador y Equipo) y la API también las bloquea.
          Con la contraseña maestra se ve todo.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {HIDEABLE.map((item) => (
            <label key={item.to} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={branding.hiddenTabs.includes(item.to)}
                onChange={(e) =>
                  onChange({
                    hiddenTabs: e.target.checked
                      ? [...branding.hiddenTabs, item.to]
                      : branding.hiddenTabs.filter((t) => t !== item.to),
                  })
                }
              />
              {item.label}
            </label>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        ¿Dominio propio (panel.tuagencia.com)? Se configura en Cloudflare como dominio del Worker;
        la skill <code>/whitelabel</code> te guía paso a paso.
      </p>
    </>
  );
}
