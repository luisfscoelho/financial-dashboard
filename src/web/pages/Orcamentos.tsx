import { useState } from "react";
import type { BudgetRow } from "../../shared/types";
import { BudgetBar, budgetStatus, Button, Card, Empty, ErrorBanner, MoneyInput, MonthPicker, PageHeader } from "../components/ui";
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
