import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "../../shared/invoices";
import { todayISO } from "../../shared/months";
import type { AccountWithBalance, Invoice } from "../../shared/types";
import { Button, Card, Empty, ErrorBanner, Field, Input, Modal, MoneyInput, PageHeader, Select } from "../components/ui";
import { api, useData } from "../lib/api";
import { formatBRL, formatDate, formatMonth } from "../lib/format";
import { TransactionTable } from "./Transacoes";

/** Status sempre com ícone + rótulo; a cor nunca carrega o significado sozinha. */
const STATUS_STYLE: Record<InvoiceStatus, { icon: string; color: string }> = {
  paga: { icon: "✓", color: "var(--good)" },
  aberta: { icon: "●", color: "var(--accent)" },
  fechada: { icon: "●", color: "var(--warning)" },
  vencida: { icon: "▲", color: "var(--critical)" },
  futura: { icon: "○", color: "var(--muted)" },
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-ink-2">
      <span aria-hidden style={{ color: s.color }}>
        {s.icon}
      </span>
      {INVOICE_STATUS_LABELS[status]}
    </span>
  );
}

export function Faturas() {
  const [params, setParams] = useSearchParams();
  const { data: accounts, error: accError } = useData(() => api.accounts(), []);
  const cards = accounts?.filter((a) => a.type === "cartao" && a.closing_day) ?? [];
  const cardId = Number(params.get("cartao")) || cards[0]?.id;
  const card = cards.find((c) => c.id === cardId);

  const { data: invoices, error, reload } = useData(() => (cardId ? api.invoices(cardId) : Promise.resolve([])), [cardId]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = invoices?.find((i) => i.month === selected) ?? invoices?.find((i) => i.status === "aberta") ?? invoices?.[0];

  if (accounts && cards.length === 0) {
    return (
      <>
        <PageHeader title="Faturas" />
        <Card>
          <Empty>
            Nenhum cartão com fechamento configurado.{" "}
            <Link to="/contas" className="text-accent hover:underline">
              Configure o dia de fechamento e de vencimento em Contas
            </Link>
            .
          </Empty>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Faturas">
        {cards.length > 1 && (
          <Select
            value={cardId ?? ""}
            onChange={(e) => {
              setSelected(null);
              setParams({ cartao: e.target.value });
            }}
            className="w-auto"
          >
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </PageHeader>
      <ErrorBanner message={accError ?? error} />
      {card && (
        <p className="-mt-3 mb-4 text-sm text-ink-2">
          {card.name} · fecha dia {card.closing_day}, vence dia {card.due_day}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2" title="Todas as faturas">
          <ul className="-mx-2 flex flex-col">
            {invoices?.map((inv) => (
              <li key={inv.month}>
                <button
                  onClick={() => setSelected(inv.month)}
                  aria-current={inv.month === current?.month}
                  className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left text-sm ${
                    inv.month === current?.month ? "bg-surface-2" : "hover:bg-surface-2"
                  }`}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{formatMonth(inv.month)}</span>
                    <span className="text-xs text-muted">vence {formatDate(inv.due_date)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="tabular">{formatBRL(inv.total_cents)}</span>
                    <StatusBadge status={inv.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="min-w-0 lg:col-span-3">
          {card && current && <InvoiceDetail key={`${card.id}-${current.month}`} card={card} invoice={current} accounts={accounts ?? []} onPaid={reload} />}
        </div>
      </div>
    </>
  );
}

function InvoiceDetail({
  card,
  invoice,
  accounts,
  onPaid,
}: {
  card: AccountWithBalance;
  invoice: Invoice;
  accounts: AccountWithBalance[];
  onPaid: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const { data: rows, reload } = useData(() => api.transactions({ account: card.id, invoice: invoice.month }), [card.id, invoice.month, invoice.paid_cents]);
  const remaining = invoice.total_cents - invoice.paid_cents;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Fatura de {formatMonth(invoice.month)}</h2>
          <div className="mt-0.5 text-sm text-ink-2">
            Fecha em {formatDate(invoice.closing_date)} · vence em {formatDate(invoice.due_date)}
          </div>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-ink-2">Total</dt>
          <dd className="mt-0.5 text-2xl font-semibold">{formatBRL(invoice.total_cents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-2">Pago</dt>
          <dd className="mt-0.5 text-2xl font-semibold">{formatBRL(invoice.paid_cents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-2">{remaining >= 0 ? "Restante" : "Pago a mais"}</dt>
          <dd className={`mt-0.5 text-2xl font-semibold ${remaining > 0 && invoice.status === "vencida" ? "text-negative" : ""}`}>
            {formatBRL(Math.abs(remaining))}
          </dd>
        </div>
      </dl>

      {remaining > 0 && invoice.status !== "futura" && (
        <Button variant="primary" className="mt-4" onClick={() => setPaying(true)}>
          Pagar fatura
        </Button>
      )}

      <h3 className="mt-6 mb-2 text-sm font-semibold">Lançamentos</h3>
      {rows && rows.length === 0 ? <Empty>Nenhum lançamento nesta fatura.</Empty> : <TransactionTable rows={rows ?? []} hideAccount />}

      {paying && (
        <PayInvoiceForm
          card={card}
          invoice={invoice}
          remaining={remaining}
          accounts={accounts.filter((a) => a.type !== "cartao" && !a.archived)}
          onClose={() => setPaying(false)}
          onPaid={() => {
            setPaying(false);
            reload();
            onPaid();
          }}
        />
      )}
    </Card>
  );
}

function PayInvoiceForm({
  card,
  invoice,
  remaining,
  accounts,
  onClose,
  onPaid,
}: {
  card: AccountWithBalance;
  invoice: Invoice;
  remaining: number;
  accounts: AccountWithBalance[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const [accountId, setAccountId] = useState(String(accounts.find((a) => a.type === "corrente")?.id ?? accounts[0]?.id ?? ""));
  const [amount, setAmount] = useState<number | null>(remaining);
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || amount <= 0) return setError("Informe um valor maior que zero");
    try {
      await api.payInvoice(card.id, invoice.month, { account_id: Number(accountId), amount_cents: amount, date });
      onPaid();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title={`Pagar fatura de ${formatMonth(invoice.month)}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <ErrorBanner message={error} />
        {accounts.length === 0 && <ErrorBanner message="Cadastre uma conta corrente ou poupança para pagar a fatura." />}
        <Field label="Pagar com">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · saldo {formatBRL(a.balance_cents)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} required autoFocus />
          </Field>
          <Field label="Data do pagamento">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
        <p className="text-xs text-ink-2">
          Registra uma transferência de {formatBRL(amount ?? 0)} para {card.name}. Valor restante da fatura: {formatBRL(remaining)}.
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={accounts.length === 0}>
            Confirmar pagamento
          </Button>
        </div>
      </form>
    </Modal>
  );
}
