import { useState } from "react";
import { MAX_INSTALLMENTS, type AccountWithBalance, type Category, type TransactionKind, type TransactionView } from "../../shared/types";
import { Button, Card, Empty, ErrorBanner, Field, Input, Modal, MoneyInput, MonthPicker, PageHeader, Select } from "../components/ui";
import { api, useData } from "../lib/api";
import { addMonthsToDate, splitInstallments, todayISO } from "../../shared/months";
import { formatBRL, formatDate } from "../lib/format";
import { useMonth } from "../lib/month";

const KIND_LABELS: Record<TransactionKind, string> = {
  despesa: "Despesa",
  receita: "Receita",
  transferencia: "Transferência",
};

export function Transacoes() {
  const [month, setMonth] = useMonth();
  const [allMonths, setAllMonths] = useState(false);
  const [account, setAccount] = useState("");
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<TransactionView | "new" | null>(null);

  const { data: accounts } = useData(() => api.accounts(true), []);
  const { data: categories } = useData(() => api.categories(), []);
  const { data: rows, error, reload } = useData(
    () =>
      api.transactions({
        month: allMonths ? undefined : month,
        account: Number(account) || undefined,
        category: Number(category) || undefined,
        kind: (kind as TransactionKind) || undefined,
        q: q || undefined,
      }),
    [month, allMonths, account, category, kind, q],
  );

  const income = rows?.filter((r) => r.kind === "receita").reduce((s, r) => s + r.amount_cents, 0) ?? 0;
  const expense = rows?.filter((r) => r.kind === "despesa").reduce((s, r) => s + r.amount_cents, 0) ?? 0;

  return (
    <>
      <PageHeader title="Transações">
        {!allMonths && <MonthPicker month={month} onChange={setMonth} />}
        <Button variant="primary" onClick={() => setEditing("new")} disabled={!accounts?.length}>
          + Nova transação
        </Button>
      </PageHeader>
      <ErrorBanner message={error} />
      {accounts && accounts.length === 0 && (
        <ErrorBanner message="Cadastre uma conta na página Contas antes de lançar transações." />
      )}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Buscar">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Descrição…" />
          </Field>
          <Field label="Tipo">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(KIND_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Conta">
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Todas</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink-2">
            <input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} />
            Todos os meses
          </label>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-ink-2">Receitas </span>
            <span className="tabular font-medium text-positive">{formatBRL(income)}</span>
          </span>
          <span>
            <span className="text-ink-2">Despesas </span>
            <span className="tabular font-medium text-negative">{formatBRL(expense)}</span>
          </span>
          <span>
            <span className="text-ink-2">Saldo </span>
            <span className="tabular font-medium">{formatBRL(income - expense)}</span>
          </span>
          <span className="text-muted">{rows?.length ?? 0} lançamento(s)</span>
        </div>
        {rows && rows.length === 0 ? (
          <Empty>Nenhuma transação encontrada.</Empty>
        ) : (
          <TransactionTable rows={rows ?? []} onSelect={setEditing} />
        )}
      </Card>

      {editing && accounts && categories && (
        <TransactionForm
          tx={editing === "new" ? null : editing}
          accounts={accounts}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(again) => {
            if (!again) setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

export function TransactionTable({ rows, onSelect }: { rows: TransactionView[]; onSelect?: (t: TransactionView) => void }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-4 py-2 font-medium sm:pl-5">Data</th>
            <th className="px-2 py-2 font-medium">Descrição</th>
            <th className="px-2 py-2 font-medium">Categoria</th>
            <th className="px-2 py-2 font-medium">Conta</th>
            <th className="px-4 py-2 text-right font-medium sm:pr-5">Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              onClick={() => onSelect?.(t)}
              className={`border-b border-line last:border-0 ${onSelect ? "cursor-pointer hover:bg-surface-2" : ""}`}
            >
              <td className="tabular px-4 py-2.5 whitespace-nowrap text-ink-2 sm:pl-5">{formatDate(t.date)}</td>
              <td className="px-2 py-2.5">
                {t.description || (!t.installment_plan_id && <span className="text-muted">—</span>)}
                {t.installment_plan_id && (
                  <span
                    className="tabular ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-xs whitespace-nowrap text-ink-2"
                    title={`Parcela ${t.installment_number} de ${t.installment_total}`}
                  >
                    {t.installment_number}/{t.installment_total}
                  </span>
                )}
              </td>
              <td className="px-2 py-2.5 whitespace-nowrap">
                {t.kind === "transferencia" ? (
                  <span className="text-ink-2">Transferência</span>
                ) : t.category_name ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: t.category_color ?? undefined }} />
                    {t.category_name}
                  </span>
                ) : (
                  <span className="text-muted">Sem categoria</span>
                )}
              </td>
              <td className="px-2 py-2.5 whitespace-nowrap text-ink-2">
                {t.account_name}
                {t.to_account_name && ` → ${t.to_account_name}`}
              </td>
              <td
                className={`tabular px-4 py-2.5 text-right font-medium whitespace-nowrap sm:pr-5 ${
                  t.kind === "receita" ? "text-positive" : t.kind === "despesa" ? "text-negative" : "text-ink-2"
                }`}
              >
                {t.kind === "despesa" ? "−" : t.kind === "receita" ? "+" : ""}
                {formatBRL(t.amount_cents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionForm({
  tx,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  tx: TransactionView | null;
  accounts: AccountWithBalance[];
  categories: Category[];
  onClose: () => void;
  onSaved: (again: boolean) => void;
}) {
  const active = accounts.filter((a) => !a.archived || a.id === tx?.account_id || a.id === tx?.to_account_id);
  const [kind, setKind] = useState<TransactionKind>(tx?.kind ?? "despesa");
  const [amount, setAmount] = useState<number | null>(tx?.amount_cents ?? null);
  const [date, setDate] = useState(tx?.date ?? todayISO());
  const [accountId, setAccountId] = useState(String(tx?.account_id ?? active[0]?.id ?? ""));
  const [toAccountId, setToAccountId] = useState(String(tx?.to_account_id ?? active[1]?.id ?? ""));
  const [categoryId, setCategoryId] = useState(String(tx?.category_id ?? ""));
  const [description, setDescription] = useState(tx?.description ?? "");
  const [installments, setInstallments] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const kindCategories = categories.filter((c) => c.kind === kind);
  const isCard = active.find((a) => String(a.id) === accountId)?.type === "cartao";
  // Parcelamento só na criação de despesas no cartão
  const canSplit = !tx && kind === "despesa" && isCard;
  const count = canSplit ? installments : 1;

  async function save(again: boolean) {
    if (!amount || amount <= 0) return setError("Informe um valor maior que zero");
    const body = {
      kind,
      amount_cents: amount,
      date,
      account_id: Number(accountId),
      description,
      ...(count > 1 && { installments: count }),
      ...(kind === "transferencia"
        ? { to_account_id: Number(toAccountId) }
        : { category_id: categoryId ? Number(categoryId) : null }),
    };
    try {
      if (tx) await api.updateTransaction(tx.id, body);
      else await api.createTransaction(body);
      setError(null);
      if (again) {
        setAmount(null);
        setDescription("");
        setInstallments(1);
      }
      onSaved(again);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removePlan() {
    if (!tx?.installment_plan_id) return;
    if (!confirm(`Excluir todas as ${tx.installment_total} parcelas desta compra?`)) return;
    try {
      await api.deleteInstallmentPlan(tx.installment_plan_id);
      onSaved(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    if (!tx || !confirm(tx.installment_plan_id ? "Excluir somente esta parcela?" : "Excluir esta transação?")) return;
    try {
      await api.deleteTransaction(tx.id);
      onSaved(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title={tx ? "Editar transação" : "Nova transação"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        className="flex flex-col gap-3"
      >
        <ErrorBanner message={error} />
        {tx?.installment_plan_id && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="text-ink-2">
              Parcela <strong className="text-ink">{tx.installment_number}</strong> de {tx.installment_total} · compra de{" "}
              {formatBRL(tx.installment_plan_total_cents ?? 0)}. As alterações valem só para esta parcela.
            </span>
            <Button type="button" variant="danger" className="px-2 py-1 text-xs" onClick={removePlan}>
              Excluir todas as parcelas
            </Button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
          {(Object.keys(KIND_LABELS) as TransactionKind[]).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => {
                setKind(k);
                setCategoryId("");
              }}
              className={`cursor-pointer rounded-md py-1.5 text-sm ${kind === k ? "bg-surface font-medium shadow-sm" : "text-ink-2"}`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={count > 1 ? "Valor total da compra" : "Valor"}>
            <MoneyInput value={amount} onChange={setAmount} required autoFocus />
          </Field>
          <Field label={count > 1 ? "Data da 1ª parcela" : "Data"}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
        {canSplit && (
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Parcelas">
              <Select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                <option value={1}>À vista</option>
                {Array.from({ length: MAX_INSTALLMENTS - 1 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </Select>
            </Field>
            {count > 1 && <InstallmentPreview total={amount} count={count} firstDate={date} />}
          </div>
        )}
        <Field label="Descrição">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Supermercado" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === "transferencia" ? "De" : "Conta"}>
            <Select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                if (e.target.value === toAccountId) {
                  setToAccountId(String(active.find((a) => String(a.id) !== e.target.value)?.id ?? ""));
                }
              }}
            >
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "transferencia" ? (
            <Field label="Para">
              <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                {active
                  .filter((a) => String(a.id) !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : (
            <Field label="Categoria">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {kindCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2">
          {tx ? (
            <Button type="button" variant="danger" onClick={remove}>
              Excluir
            </Button>
          ) : (
            <Button type="button" onClick={() => save(true)}>
              Salvar e adicionar outra
            </Button>
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

function InstallmentPreview({ total, count, firstDate }: { total: number | null; count: number; firstDate: string }) {
  if (!total || total < count) return <p className="pb-2 text-xs text-muted">Informe o valor total</p>;
  const [first, other] = splitInstallments(total, count) as [number, number];
  return (
    <p className="pb-1 text-xs leading-relaxed text-ink-2">
      {first === other ? (
        <>
          <strong className="tabular text-ink">{count}x</strong> de <strong className="tabular text-ink">{formatBRL(other)}</strong>
        </>
      ) : (
        <>
          1ª de <strong className="tabular text-ink">{formatBRL(first)}</strong> + {count - 1}x de{" "}
          <strong className="tabular text-ink">{formatBRL(other)}</strong>
        </>
      )}
      <br />
      Última em {formatDate(addMonthsToDate(firstDate, count - 1))}
    </p>
  );
}
