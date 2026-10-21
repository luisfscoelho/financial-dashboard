import { useState } from "react";
import { Link } from "react-router-dom";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType, type AccountWithBalance } from "../../shared/types";
import { Button, Card, Empty, ErrorBanner, Field, Input, Modal, MoneyInput, PageHeader, Select } from "../components/ui";
import { api, useData } from "../lib/api";
import { formatBRL } from "../lib/format";

export function Contas() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: accounts, error, reload } = useData(() => api.accounts(showArchived), [showArchived]);
  const [editing, setEditing] = useState<AccountWithBalance | "new" | null>(null);

  const active = accounts?.filter((a) => !a.archived) ?? [];
  const total = active.reduce((s, a) => s + a.balance_cents, 0);
  const byType = ACCOUNT_TYPES.map((type) => ({
    type,
    total: active.filter((a) => a.type === type).reduce((s, a) => s + a.balance_cents, 0),
    count: active.filter((a) => a.type === type).length,
  })).filter((g) => g.count > 0);

  return (
    <>
      <PageHeader title="Contas">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar arquivadas
        </label>
        <Button variant="primary" onClick={() => setEditing("new")}>
          + Nova conta
        </Button>
      </PageHeader>
      <ErrorBanner message={error} />

      <Card className="mb-5">
        <div className="text-sm text-ink-2">Patrimônio total</div>
        <div className={`mt-1 text-4xl font-semibold ${total < 0 ? "text-negative" : ""}`}>{formatBRL(total)}</div>
        {byType.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {byType.map((g) => (
              <div key={g.type}>
                <span className="text-ink-2">{ACCOUNT_TYPE_LABELS[g.type]}: </span>
                <span className="tabular font-medium">{formatBRL(g.total)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {accounts && accounts.length === 0 && (
        <Card>
          <Empty>Nenhuma conta cadastrada. Comece criando sua conta corrente, poupança ou cartão.</Empty>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts?.map((a) => (
          <div key={a.id} className={`flex flex-col rounded-xl border border-line bg-surface ${a.archived ? "opacity-60" : ""}`}>
            <button
              onClick={() => setEditing(a)}
              className="flex flex-1 cursor-pointer flex-col rounded-xl p-4 text-left transition-colors hover:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted">
                    {ACCOUNT_TYPE_LABELS[a.type]}
                    {a.closing_day && ` · fecha dia ${a.closing_day}, vence dia ${a.due_day}`}
                    {a.archived ? " · arquivada" : ""}
                  </div>
                </div>
              </div>
              <div className={`mt-4 text-2xl font-semibold ${a.balance_cents < 0 ? "text-negative" : ""}`}>
                {formatBRL(a.balance_cents)}
              </div>
              {a.future_cents !== 0 && (
                <div className="tabular mt-1 text-xs text-ink-2">
                  {a.future_cents < 0
                    ? `${formatBRL(-a.future_cents)} em lançamentos futuros${a.type === "cartao" ? " (parcelas a vencer)" : ""}`
                    : `+${formatBRL(a.future_cents)} em lançamentos futuros`}
                </div>
              )}
            </button>
            {a.type === "cartao" && (
              <div className="border-t border-line px-4 py-2 text-xs">
                {a.closing_day ? (
                  <Link to={`/faturas?cartao=${a.id}`} className="text-accent hover:underline">
                    Ver faturas →
                  </Link>
                ) : (
                  <button onClick={() => setEditing(a)} className="cursor-pointer text-ink-2 hover:text-ink">
                    Configure o fechamento para ver as faturas
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <AccountForm
          account={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function AccountForm({
  account,
  onClose,
  onSaved,
}: {
  account: AccountWithBalance | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "corrente");
  const [initial, setInitial] = useState<number | null>(account?.initial_balance_cents ?? 0);
  const [archived, setArchived] = useState(Boolean(account?.archived));
  const [closingDay, setClosingDay] = useState(String(account?.closing_day ?? ""));
  const [dueDay, setDueDay] = useState(String(account?.due_day ?? ""));
  const [error, setError] = useState<string | null>(null);
  const cycleChanged = account?.type === "cartao" && (String(account.closing_day ?? "") !== closingDay || String(account.due_day ?? "") !== dueDay);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name,
      type,
      initial_balance_cents: initial ?? 0,
      archived,
      closing_day: closingDay ? Number(closingDay) : null,
      due_day: dueDay ? Number(dueDay) : null,
    };
    try {
      if (account) await api.updateAccount(account.id, body);
      else await api.createAccount(body);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    if (!account || !confirm(`Excluir a conta "${account.name}"?`)) return;
    try {
      await api.deleteAccount(account.id);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title={account ? "Editar conta" : "Nova conta"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <ErrorBanner message={error} />
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nubank" required autoFocus />
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={type === "cartao" ? "Saldo inicial (fatura em aberto = valor negativo)" : "Saldo inicial"}>
          <MoneyInput value={initial} onChange={setInitial} allowNegative />
        </Field>
        {type === "cartao" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dia de fechamento">
                <DaySelect value={closingDay} onChange={setClosingDay} />
              </Field>
              <Field label="Dia de vencimento">
                <DaySelect value={dueDay} onChange={setDueDay} />
              </Field>
            </div>
            <p className="-mt-1 text-xs text-ink-2">
              Compras a partir do dia de fechamento entram na fatura seguinte, e cada compra conta nos relatórios e
              orçamentos no mês de vencimento da fatura.
              {cycleChanged && account && " Ao salvar, as compras já lançadas neste cartão serão redistribuídas nas faturas."}
            </p>
          </>
        )}
        {account && (
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            Arquivar (some das listas, mas mantém o histórico)
          </label>
        )}
        <div className="mt-2 flex justify-between gap-2">
          {account ? (
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
            <Button type="submit" variant="primary">
              Salvar
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function DaySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
        <option key={d} value={d}>
          Dia {d}
        </option>
      ))}
    </Select>
  );
}
