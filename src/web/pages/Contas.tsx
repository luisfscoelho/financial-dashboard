import { useState } from "react";
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
          <button
            key={a.id}
            onClick={() => setEditing(a)}
            className={`cursor-pointer rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:bg-surface-2 ${
              a.archived ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-muted">
                  {ACCOUNT_TYPE_LABELS[a.type]}
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
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { name, type, initial_balance_cents: initial ?? 0, archived };
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
