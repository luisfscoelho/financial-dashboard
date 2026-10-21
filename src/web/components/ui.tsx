import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { addMonths } from "../../shared/months";
import { centsToInput, formatMonth, parseBRL } from "../lib/format";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-default",
        variant === "primary" && "bg-accent text-accent-ink hover:brightness-110",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
        variant === "danger" && "text-negative hover:bg-surface-2",
        className,
      )}
    />
  );
}

export function Card({ className, children, title, action }: { className?: string; children: ReactNode; title?: string; action?: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface p-4 sm:p-5", className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-negative">
      {message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

export const Input = ({ className, ...p }: ComponentProps<"input">) => <input {...p} className={cx(inputCls, className)} />;
export const Select = ({ className, ...p }: ComponentProps<"select">) => <select {...p} className={cx(inputCls, className)} />;

/** Campo de valor em reais; `value`/`onChange` em centavos (null = vazio/inválido). */
export function MoneyInput({
  value,
  onChange,
  allowNegative,
  ...rest
}: { value: number | null; onChange: (cents: number | null) => void; allowNegative?: boolean } & Omit<
  ComponentProps<"input">,
  "value" | "onChange"
>) {
  const [text, setText] = useState(value === null ? "" : centsToInput(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value === null ? "" : centsToInput(value));
      last.current = value;
    }
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">R$</span>
      <Input
        {...rest}
        inputMode="decimal"
        placeholder="0,00"
        className="pl-9 tabular"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const cents = parseBRL(e.target.value);
          const v = cents !== null && (allowNegative || cents >= 0) ? cents : null;
          last.current = v;
          onChange(v);
        }}
        onBlur={() => value !== null && setText(centsToInput(value))}
      />
    </div>
  );
}

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
      <Button variant="ghost" className="px-2" aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}>
        ‹
      </Button>
      <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
      <Button variant="ghost" className="px-2" aria-label="Próximo mês" onClick={() => onChange(addMonths(month, 1))}>
        ›
      </Button>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <div className="p-5">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" className="px-2" aria-label="Fechar" onClick={onClose}>
            ✕
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

/** Barra de orçamento: verde < 80%, amarelo 80–100%, vermelho > 100%; sempre com rótulo textual. */
export function budgetStatus(spent: number, limit: number) {
  const pct = limit > 0 ? spent / limit : 0;
  if (pct > 1) return { pct, color: "var(--critical)", label: "Estourado", icon: "▲" };
  if (pct >= 0.8) return { pct, color: "var(--warning)", label: "Atenção", icon: "●" };
  return { pct, color: "var(--good)", label: "No limite", icon: "✓" };
}

export function BudgetBar({ spent, limit }: { spent: number; limit: number }) {
  const { pct, color } = budgetStatus(spent, limit);
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 1) * 100}%`, background: color }} />
    </div>
  );
}
