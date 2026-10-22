import { useState } from "react";
import { currentMonth } from "../../shared/months";
import type { AccountWithBalance, GoalView } from "../../shared/types";
import { Button, Card, Empty, ErrorBanner, Field, Input, Modal, MoneyInput, PageHeader, Select } from "../components/ui";
import { api, useData } from "../lib/api";
import { formatBRL, formatMonth } from "../lib/format";

/** Meses de `from` até `to` (inclusive); 0 se `to` já passou. */
function monthsUntil(from: string, to: string) {
  const n = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));
  return Math.max(n(to) - n(from) + 1, 0);
}

export function Metas() {
  const goals = useData(() => api.goals(), []);
  const accounts = useData(() => api.accounts(), []);
  const [editing, setEditing] = useState<GoalView | "new" | null>(null);

  const list = goals.data ?? [];
  const totalTarget = list.reduce((s, g) => s + g.target_cents, 0);
  const totalCurrent = list.reduce((s, g) => s + Math.min(g.current_cents, g.target_cents), 0);

  return (
    <>
      <PageHeader title="Metas">
        <Button variant="primary" onClick={() => setEditing("new")}>
          + Nova meta
        </Button>
      </PageHeader>
      <ErrorBanner message={goals.error ?? accounts.error} />

      {list.length > 0 && (
        <Card className="mb-5">
          <div className="text-sm text-ink-2">Progresso geral</div>
          <div className="mt-1 text-3xl font-semibold">
            {formatBRL(totalCurrent)} <span className="text-base font-normal text-muted">de {formatBRL(totalTarget)}</span>
          </div>
          <div className="mt-3">
            <GoalBar current={totalCurrent} target={totalTarget} />
          </div>
        </Card>
      )}

      {goals.data && list.length === 0 && (
        <Card>
          <Empty>Nenhuma meta cadastrada. Crie uma meta e vincule à conta onde você guarda esse dinheiro.</Empty>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((g) => (
          <GoalCard key={g.id} goal={g} onEdit={() => setEditing(g)} />
        ))}
      </div>

      {editing && accounts.data && (
        <GoalForm
          goal={editing === "new" ? null : editing}
          accounts={accounts.data}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            goals.reload();
          }}
        />
      )}
    </>
  );
}

function GoalBar({ current, target }: { current: number; target: number }) {
  const pct = target > 0 ? Math.max(current, 0) / target : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-[var(--good)] transition-all" style={{ width: `${Math.min(pct, 1) * 100}%` }} />
    </div>
  );
}

function GoalCard({ goal, onEdit }: { goal: GoalView; onEdit: () => void }) {
  const remaining = goal.target_cents - goal.current_cents;
  const pct = Math.max(goal.current_cents, 0) / goal.target_cents;
  const months = goal.target_month ? monthsUntil(currentMonth(), goal.target_month) : null;
  return (
    <button
      onClick={onEdit}
      className="flex cursor-pointer flex-col rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{goal.name}</div>
          <div className="text-xs text-muted">
            {goal.account_name}
            {goal.target_month && ` · até ${formatMonth(goal.target_month)}`}
          </div>
        </div>
        <span className="tabular text-sm font-medium">{(pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
      </div>
      <div className="mt-4 text-2xl font-semibold">
        {formatBRL(goal.current_cents)} <span className="text-sm font-normal text-muted">/ {formatBRL(goal.target_cents)}</span>
      </div>
      <div className="mt-2">
        <GoalBar current={goal.current_cents} target={goal.target_cents} />
      </div>
      <div className="tabular mt-2 text-xs text-ink-2">
        {remaining <= 0
          ? "✓ Meta atingida"
          : months === null
            ? `Faltam ${formatBRL(remaining)}`
            : months === 0
              ? `Prazo encerrado · faltam ${formatBRL(remaining)}`
              : `Faltam ${formatBRL(remaining)} · ${formatBRL(Math.ceil(remaining / months))}/mês por ${months} ${months === 1 ? "mês" : "meses"}`}
      </div>
    </button>
  );
}

function GoalForm({
  goal,
  accounts,
  onClose,
  onSaved,
}: {
  goal: GoalView | null;
  accounts: AccountWithBalance[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState<number | null>(goal?.target_cents ?? null);
  const [accountId, setAccountId] = useState(String(goal?.account_id ?? accounts.find((a) => a.type === "investimento" || a.type === "poupanca")?.id ?? ""));
  const [targetMonth, setTargetMonth] = useState(goal?.target_month ?? "");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { name, target_cents: target, account_id: Number(accountId) || null, target_month: targetMonth || null };
    try {
      if (goal) await api.updateGoal(goal.id, body);
      else await api.createGoal(body);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    if (!goal || !confirm(`Excluir a meta "${goal.name}"?`)) return;
    try {
      await api.deleteGoal(goal.id);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title={goal ? "Editar meta" : "Nova meta"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <ErrorBanner message={error} />
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Reserva de emergência" required autoFocus />
        </Field>
        <Field label="Valor da meta">
          <MoneyInput value={target} onChange={setTarget} required />
        </Field>
        <Field label="Conta onde o dinheiro está guardado">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            <option value="">Selecione…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatBRL(a.balance_cents)})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prazo (opcional)">
          <Input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
        </Field>
        <p className="-mt-1 text-xs text-ink-2">O valor atual da meta é o saldo da conta escolhida, atualizado pelos seus lançamentos.</p>
        <div className="mt-2 flex justify-between gap-2">
          {goal ? (
            <Button type="button" variant="danger" onClick={remove}>
              Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={!target || !accountId}>
              Salvar
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
