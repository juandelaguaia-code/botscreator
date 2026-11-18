import { useState } from "react";

/**
 * Barras de una sola serie (magnitud por día): un solo tono de marca, barras finas con extremo
 * redondeado apoyado en la base, 2 px de separación, tooltip al pasar el mouse y tabla accesible.
 */
export function BarChart({
  title,
  data,
  format = (v) => String(v),
}: {
  title: string;
  data: Array<{ label: string; value: number }>;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const active = hover !== null ? data[hover] : null;

  return (
    <figure className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <button
          type="button"
          className="text-xs text-slate-500 hover:underline"
          onClick={() => setTable(!table)}
        >
          {table ? "Ver gráfico" : "Ver tabla"}
        </button>
      </figcaption>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{format(total)}</p>
      <p className="h-5 text-xs text-slate-500">
        {active ? `${active.label}: ${format(active.value)}` : "Total del periodo"}
      </p>
      {table ? (
        <table className="mt-2 w-full text-left text-xs">
          <tbody className="divide-y divide-slate-100">
            {data.map((d) => (
              <tr key={d.label}>
                <td className="py-1 text-slate-500">{d.label}</td>
                <td className="py-1 text-right tabular-nums text-slate-800">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          className="mt-3 flex h-32 items-end gap-[2px] border-b border-slate-200"
          role="img"
          aria-label={title}
        >
          {data.map((d, i) => (
            <button
              key={d.label}
              type="button"
              className="flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${d.label}: ${format(d.value)}`}
            >
              <span
                className={`block w-full rounded-t-[4px] ${hover === i ? "bg-brand-700" : "bg-brand-500"}`}
                style={{ height: `${d.value === 0 ? 0 : Math.max(3, (d.value / max) * 100)}%` }}
              />
            </button>
          ))}
        </div>
      )}
    </figure>
  );
}
