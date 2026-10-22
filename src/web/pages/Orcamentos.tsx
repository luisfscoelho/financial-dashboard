import { useState } from "react";
import { IDEAL_BUCKET_LABELS, IDEAL_BUCKETS, type BudgetRow, type IdealBucket } from "../../shared/types";
import { BudgetBar, budgetStatus, Button, Card, Empty, ErrorBanner, Field, Input, MoneyInput, MonthPicker, PageHeader } from "../components/ui";
import { api, useData } from "../lib/api";
import { formatBRL } from "../lib/format";
import { useMonth } from "../lib/month";

export function Orcamentos() {
  const [month, setMonth] = useMonth();
  const { data: rows, error, reload } = useData(() => api.budgets(month), [month]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const budgeted = rows?.filter((r) => r.limit_cents !== null) ?? [];
  const unbudgeted = rows?.filter((r) => r.limit_cents === null) ?? [];
  const totalLimit = budgeted.reduce((s, r) => s + r.limit_cents!, 0);
  const totalSpent = budgeted.reduce((s, r) => s + r.spent_cents, 0);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      setActionError(null);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function copyPrevious() {
    try {
      const { copied } = await api.copyBudgets(month);
      setActionError(copied === 0 ? "Nenhum orçamento novo para copiar do mês anterior." : null);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Orçamentos">
        <MonthPicker month={month} onChange={setMonth} />
        <Button onClick={copyPrevious}>Copiar do mês anterior</Button>
      </PageHeader>
      <ErrorBanner message={error ?? actionError} />

      <IdealCard month={month} editable className="mb-5" />

      {budgeted.length > 0 && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-sm text-ink-2">Gasto nas categorias orçadas</div>
              <div className="mt-1 text-3xl font-semibold">
                {formatBRL(totalSpent)} <span className="text-base font-normal text-muted">de {formatBRL(totalLimit)}</span>
              </div>
            </div>
            <div className={`text-sm ${totalSpent > totalLimit ? "text-negative" : "text-ink-2"}`}>
              {totalSpent > totalLimit
                ? `${formatBRL(totalSpent - totalLimit)} acima do total`
                : `${formatBRL(totalLimit - totalSpent)} disponíveis`}
            </div>
          </div>
          <div className="mt-3">
            <BudgetBar spent={totalSpent} limit={totalLimit} />
          </div>
        </Card>
      )}

      <Card title="Categorias com orçamento" className="mb-5">
        {budgeted.length === 0 ? (
          <Empty>Nenhum orçamento definido neste mês. Defina limites nas categorias abaixo.</Empty>
        ) : (
          <ul className="flex flex-col gap-4">
            {budgeted.map((r) => (
              <BudgetItem
                key={r.category_id}
                row={r}
                editing={editing === r.category_id}
                onEdit={() => setEditing(r.category_id)}
                onCancel={() => setEditing(null)}
                onSave={(limit) => run(() => api.setBudget({ category_id: r.category_id, month, limit_cents: limit })).then(() => setEditing(null))}
                onRemove={() => run(() => api.deleteBudget(r.id!))}
              />
            ))}
          </ul>
        )}
      </Card>

      {unbudgeted.length > 0 && (
        <Card title="Sem orçamento">
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {unbudgeted.map((r) => (
              <li key={r.category_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: r.category_color }} />
                  {r.category_name}
                  {r.spent_cents > 0 && <span className="tabular text-muted">· gasto {formatBRL(r.spent_cents)}</span>}
                </span>
                {editing === r.category_id ? (
                  <LimitEditor
                    initial={r.spent_cents > 0 ? r.spent_cents : null}
                    onCancel={() => setEditing(null)}
                    onSave={(limit) => run(() => api.setBudget({ category_id: r.category_id, month, limit_cents: limit })).then(() => setEditing(null))}
                  />
                ) : (
                  <Button className="text-xs" onClick={() => setEditing(r.category_id)}>
                    Definir limite
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function BudgetItem({
  row,
  editing,
  onEdit,
  onCancel,
  onSave,
  onRemove,
}: {
  row: BudgetRow;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (limit: number) => void;
  onRemove: () => void;
}) {
  const limit = row.limit_cents!;
  const status = budgetStatus(row.spent_cents, limit);
  const remaining = limit - row.spent_cents;
  return (
    <li>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          <span className="size-2.5 rounded-full" style={{ background: row.category_color }} />
          {row.category_name}
        </span>
        {editing ? (
          <LimitEditor initial={limit} onCancel={onCancel} onSave={onSave} />
        ) : (
          <span className="flex items-center gap-1">
            <span className="tabular">
              {formatBRL(row.spent_cents)} <span className="text-muted">/ {formatBRL(limit)}</span>
            </span>
            <Button variant="ghost" className="px-2 text-xs" onClick={onEdit}>
              Editar
            </Button>
            <Button variant="ghost" className="px-2 text-xs" onClick={onRemove} aria-label="Remover orçamento">
              Remover
            </Button>
          </span>
        )}
      </div>
      <BudgetBar spent={row.spent_cents} limit={limit} />
      <div className="mt-1 flex justify-between text-xs text-ink-2">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden style={{ color: status.color }}>
            {status.icon}
          </span>
          {status.label} · {Math.round(status.pct * 100)}%
        </span>
        <span className="tabular">{remaining >= 0 ? `Restam ${formatBRL(remaining)}` : `Excedeu ${formatBRL(-remaining)}`}</span>
      </div>
    </li>
  );
}

function LimitEditor({ initial, onSave, onCancel }: { initial: number | null; onSave: (v: number) => void; onCancel: () => void }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (value && value > 0) onSave(value);
      }}
    >
      <div className="w-36">
        <MoneyInput value={value} onChange={setValue} autoFocus />
      </div>
      <Button type="submit" variant="primary" className="text-xs" disabled={!value || value <= 0}>
        Salvar
      </Button>
      <Button type="button" variant="ghost" className="text-xs" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  );
}

/**
 * Divisão ideal da renda do mês (ex.: 50/30/20) × realizado. Investimento acima da meta é bom;
 * gastos acima da meta, não.
 */
export function IdealCard({ month, editable, className }: { month: string; editable?: boolean; className?: string }) {
  const { data, error, reload } = useData(() => api.ideal(month), [month]);
  const [editing, setEditing] = useState(false);

  return (
    <Card
      title="Ideal da renda"
      className={className}
      action={
        editable &&
        data &&
        !editing && (
          <Button variant="ghost" className="px-2 text-xs" onClick={() => setEditing(true)}>
            Editar %
          </Button>
        )
      }
    >
      <ErrorBanner message={error} />
      {data && editing ? (
        <SplitEditor
          initial={Object.fromEntries(data.rows.map((r) => [r.bucket, r.pct])) as Record<IdealBucket, number>}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      ) : data && data.income_cents === 0 ? (
        <Empty>Sem receitas neste mês para calcular a divisão.</Empty>
      ) : (
        data && (
          <>
            <div className="mb-3 text-sm text-ink-2">
              Renda do mês: <span className="tabular font-medium text-ink">{formatBRL(data.income_cents)}</span>
            </div>
            <ul className="flex flex-col gap-4">
              {data.rows.map((r) => {
                const isInvest = r.bucket === "investimento";
                const actualPct = data.income_cents > 0 ? (r.actual_cents / data.income_cents) * 100 : 0;
                const diff = r.actual_cents - r.target_cents;
                const good = isInvest ? diff >= 0 : diff <= 0;
                return (
                  <li key={r.bucket}>
                    <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {IDEAL_BUCKET_LABELS[r.bucket]} <span className="font-normal text-muted">· ideal {r.pct}%</span>
                      </span>
                      <span className="tabular text-ink-2">
                        {formatBRL(r.actual_cents)} <span className="text-muted">/ {formatBRL(r.target_cents)}</span>
                      </span>
                    </div>
                    {isInvest ? <IdealInvestBar actual={r.actual_cents} target={r.target_cents} /> : <BudgetBar spent={r.actual_cents} limit={r.target_cents} />}
                    <div className="mt-1 flex justify-between text-xs text-ink-2">
                      <span className="tabular">{Math.round(actualPct)}% da renda</span>
                      <span className={`tabular ${good ? "text-positive" : "text-negative"}`}>
                        {isInvest
                          ? diff >= 0
                            ? `✓ ${formatBRL(diff)} acima da meta`
                            : `Faltam ${formatBRL(-diff)}`
                          : diff <= 0
                            ? `✓ Sobram ${formatBRL(-diff)}`
                            : `▲ ${formatBRL(diff)} acima do ideal`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )
      )}
    </Card>
  );
}

function IdealInvestBar({ actual, target }: { actual: number; target: number }) {
  const pct = target > 0 ? Math.max(actual, 0) / target : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-[var(--good)] transition-all" style={{ width: `${Math.min(pct, 1) * 100}%` }} />
    </div>
  );
}

function SplitEditor({ initial, onSaved, onCancel }: { initial: Record<IdealBucket, number>; onSaved: () => void; onCancel: () => void }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const sum = IDEAL_BUCKETS.reduce((s, b) => s + (values[b] || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.setIdealSplit(values);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <ErrorBanner message={error} />
      <div className="grid grid-cols-3 gap-3">
        {IDEAL_BUCKETS.map((b) => (
          <Field key={b} label={`${IDEAL_BUCKET_LABELS[b]} (%)`}>
            <Input
              type="number"
              min={0}
              max={100}
              value={values[b]}
              onChange={(e) => setValues({ ...values, [b]: Math.trunc(Number(e.target.value)) })}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs ${sum === 100 ? "text-ink-2" : "text-negative"}`}>Soma: {sum}% {sum !== 100 && "(precisa ser 100%)"}</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="text-xs" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" className="text-xs" disabled={sum !== 100}>
            Salvar
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">Escolha se cada categoria de despesa é "fixo" ou "livre" na tela de Categorias.</p>
    </form>
  );
}
