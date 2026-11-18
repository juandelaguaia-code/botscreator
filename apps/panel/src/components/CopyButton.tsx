import { useState } from "react";
import { cx } from "./ui.js";

/** Copia un texto al portapapeles y confirma con "Copiado". */
export function CopyButton({
  text,
  label = "Copiar prompt",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copia el texto:", text);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cx(
        "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
        copied
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-white text-brand-700 ring-slate-200 hover:bg-slate-50",
        className,
      )}
    >
      {copied ? "Copiado ✓" : label}
    </button>
  );
}
