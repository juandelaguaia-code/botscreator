import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:opacity-50",
  danger: "bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-xl bg-white ring-1 ring-slate-200", className)}>{children}</div>
  );
}

const BADGE_TONES = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-brand-50 text-brand-700",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-700",
} as const;

export function Badge({
  tone = "slate",
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

const inputBase =
  "rounded-lg border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none";

/** Ancho completo salvo que el llamador pida otro (`w-36`, `w-auto`…): así no compiten dos clases de ancho. */
const width = (className?: string) => (className && /(^|\s)w-/.test(className) ? null : "w-full");

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, width(props.className), props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(inputBase, width(props.className), "resize-y", props.className)}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(inputBase, width(props.className), "pr-8", props.className)} />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: el control llega como children
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div> : null}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}
