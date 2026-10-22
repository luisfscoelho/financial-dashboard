import { useState } from "react";
import { addMonths, todayISO } from "../../shared/months";
import { annualCost, renewingIn } from "../../shared/subscriptions";
import type { AccountWithBalance, Category, SubscriptionPeriod, SubscriptionView } from "../../shared/types";
import { Button, Card, Empty, ErrorBanner, Field, Input, Modal, MoneyInput, PageHeader, Select } from "../components/ui";
import { api, useData } from "../lib/api";
import { formatBRL, formatMonth } from "../lib/format";
import { useMonth } from "../lib/month";

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => formatMonth(`2000-${String(i + 1).padStart(2, "0")}`).replace(/ de 2000$/, ""));

export function Assinaturas() {
  const [month] = useMonth();
  const subs = useData(() => api.subscriptions(), []);
  const accounts = useData(() => api.accounts(), []);
  const categories = useData(() => api.categories(), []);
  const [editing, setEditing] = useState<SubscriptionView | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<string | null>(null);

  const list = subs.data ?? [];
  const active = list.filter((s) => s.active);
  const yearly = annualCost(list);
  const annuals = active.filter((s) => s.period === "anual");
  const upcoming = [month, addMonths(month, 1)].map((m) => ({ month: m, subs: renewingIn(list, m) }));

  async function launch(s: SubscriptionView) {
    try {
      await api.launchSubscription(s.id, todayISO());
      setActionError(null);
      setLaunched(`Despesa de ${formatBRL(s.amount_cents)} lançada para "${s.name}".`);
    } catch (e) {
      setLaunched(null);
      setActionError((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Assinaturas">
        <Button variant="primary" onClick={() => setEditing("new")}>
          + Nova assinatura
        </Button>
      </PageHeader>
      <ErrorBanner message={subs.error ?? accounts.error ?? categories.error ?? actionError} />
      {launched && <div className="mb-4 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-positive">{launched}</div>}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Custo por mês" value={Math.round(yearly / 12)} hint="Total anual ÷ 12" />
        <Stat
          label="Média por renovação anual"
          value={annuals.length ? Math.round(annuals.reduce((s, a) => s + a.amount_cents, 0) / annuals.length) : 0}
          hint={`${annuals.length} assinatura(s) anual(is)`}
        />
        <Stat label="Total no ano" value={yearly} hint={`${active.length} assinatura(s) ativa(s)`} />
      </div>

      <Card title="Renovações próximas" className="mb-5">
        {upcoming.every((u) => u.subs.length === 0) ? (
          <Empty>Nenhuma assinatura anual renova em {formatMonth(month).toLowerCase()} ou no mês seguinte.</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {upcoming
              .filter((u) => u.subs.length > 0)
              .map((u) => (
                <div key={u.month}>
                  <div className="mb-1 text-xs font-medium text-ink-2">{formatMonth(u.month)}</div>
                  <ul className="divide-y divide-[var(--border)]">
                    {u.subs.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span>{s.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="tabular">{formatBRL(s.amount_cents)}</span>
                          <Button className="text-xs" onClick={() => launch(s)} title="Cria a despesa com data de hoje">
                            Lançar
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </Card>

      <Card title="Todas as assinaturas">
        {subs.data && list.length === 0 ? (
          <Empty>Nenhuma assinatura cadastrada.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-2">
                  <th className="py-2 pr-3 font-medium">Assinatura</th>
                  <th className="py-2 pr-3 font-medium">Cobrança</th>
                  <th className="py-2 pr-3 font-medium">Conta</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor</th>
                  <th className="py-2 text-right font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {list.map((s) => (
                  <tr key={s.id} className={s.active ? "" : "opacity-60"}>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-2">
                        {s.category_color && <span className="size-2.5 rounded-full" style={{ background: s.category_color }} />}
                        {s.name}
                        {!s.active && <span className="text-xs text-muted">· inativa</span>}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{s.period === "mensal" ? "Mensal" : `Anual · ${MONTH_NAMES[s.renewal_month! - 1]}`}</td>
                    <td className="py-2 pr-3 text-ink-2">{s.account_name ?? "—"}</td>
                    <td className="tabular py-2 pr-3 text-right">{formatBRL(s.amount_cents)}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {s.active === 1 && (
                        <Button variant="ghost" className="px-2 text-xs" onClick={() => launch(s)}>
                          Lançar
                        </Button>
                      )}
                      <Button variant="ghost" className="px-2 text-xs" onClick={() => setEditing(s)}>
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && accounts.data && categories.data && (
        <SubscriptionForm
          sub={editing === "new" ? null : editing}
          accounts={accounts.data}
          categories={categories.data.filter((c) => c.kind === "despesa")}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            subs.reload();
          }}
        />
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card>
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{formatBRL(value)}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </Card>
  );
}

function SubscriptionForm({
  sub,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  sub: SubscriptionView | null;
  accounts: AccountWithBalance[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(sub?.name ?? "");
  const [amount, setAmount] = useState<number | null>(sub?.amount_cents ?? null);
  const [period, setPeriod] = useState<SubscriptionPeriod>(sub?.period ?? "anual");
  const [renewal, setRenewal] = useState(String(sub?.renewal_month ?? new Date().getMonth() + 1));
  const [accountId, setAccountId] = useState(String(sub?.account_id ?? accounts.find((a) => a.type === "cartao")?.id ?? ""));
  const [categoryId, setCategoryId] = useState(String(sub?.category_id ?? categories.find((c) => c.name === "Contas e serviços")?.id ?? ""));
  const [active, setActive] = useState(sub ? Boolean(sub.active) : true);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name,
      amount_cents: amount,
      period,
      renewal_month: period === "anual" ? Number(renewal) : null,
      account_id: Number(accountId) || null,
      category_id: Number(categoryId) || null,
      active,
    };
    try {
      if (sub) await api.updateSubscription(sub.id, body);
      else await api.createSubscription(body);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    if (!sub || !confirm(`Excluir a assinatura "${sub.name}"? Lançamentos já feitos continuam.`)) return;
    try {
      await api.deleteSubscription(sub.id);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title={sub ? "Editar assinatura" : "Nova assinatura"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <ErrorBanner message={error} />
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Spotify" required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} required />
          </Field>
          <Field label="Cobrança">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as SubscriptionPeriod)}>
              <option value="anual">Anual</option>
              <option value="mensal">Mensal</option>
            </Select>
          </Field>
        </div>
        {period === "anual" && (
          <Field label="Mês de renovação">
            <Select value={renewal} onChange={(e) => setRenewal(e.target.value)}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Conta / cartão">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {sub && (
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativa
          </label>
        )}
        <div className="mt-2 flex justify-between gap-2">
          {sub ? (
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
            <Button type="submit" variant="primary" disabled={!amount}>
              Salvar
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
