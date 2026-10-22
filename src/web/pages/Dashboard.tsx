import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { addMonths } from "../../shared/months";
import { CashflowChart, CategoryDonut, DataTable, NetWorthChart } from "../components/charts";
import { BudgetBar, budgetStatus, Button, Card, Empty, ErrorBanner, MonthPicker, PageHeader } from "../components/ui";
import { api, useData } from "../lib/api";
import { formatBRL, formatMonth } from "../lib/format";
import { useMonth } from "../lib/month";
import { IdealCard } from "./Orcamentos";
import { TransactionTable } from "./Transacoes";

export function Dashboard() {
  const [month, setMonth] = useMonth();
  const summary = useData(() => api.summary(month), [month]);
  const prev = useData(() => api.summary(addMonths(month, -1)), [month]);
  const byCat = useData(() => api.byCategory(month, "despesa"), [month]);
  const cashflow = useData(() => api.cashflow(month, 12), [month]);
  const netWorth = useData(() => api.netWorth(month, 12), [month]);
  const budgets = useData(() => api.budgets(month), [month]);
  const recent = useData(() => api.transactions({ month, limit: 8 }), [month]);

  const s = summary.data;
  const p = prev.data;
  const error = summary.error ?? byCat.error ?? cashflow.error ?? netWorth.error ?? budgets.error ?? recent.error;

  const topBudgets = (budgets.data ?? [])
    .filter((b) => b.limit_cents !== null)
    .sort((a, b) => b.spent_cents / b.limit_cents! - a.spent_cents / a.limit_cents!)
    .slice(0, 5);

  return (
    <>
      <PageHeader title="Visão geral">
        <MonthPicker month={month} onChange={setMonth} />
      </PageHeader>
      <ErrorBanner message={error} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Patrimônio" value={s?.net_worth_cents} delta={s && p ? s.net_worth_cents - p.net_worth_cents : undefined} upIsGood hero />
        <StatTile label="Receitas do mês" value={s?.income_cents} delta={s && p ? s.income_cents - p.income_cents : undefined} upIsGood />
        <StatTile label="Despesas do mês" value={s?.expense_cents} delta={s && p ? s.expense_cents - p.expense_cents : undefined} upIsGood={false} />
        <StatTile label="Saldo do mês" value={s?.net_cents} delta={s && p ? s.net_cents - p.net_cents : undefined} upIsGood colorBySign />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="Receitas × despesas · últimos 12 meses"
          table={
            cashflow.data && (
              <DataTable
                head={["Mês", "Receitas", "Despesas", "Saldo"]}
                rows={cashflow.data.map((c) => [formatMonth(c.month), formatBRL(c.income_cents), formatBRL(c.expense_cents), formatBRL(c.income_cents - c.expense_cents)])}
              />
            )
          }
        >
          {cashflow.data && <CashflowChart data={cashflow.data} />}
        </ChartCard>
        <Card className="lg:col-span-2" title="Despesas por categoria">
          {byCat.data && byCat.data.length > 0 ? <CategoryDonut rows={byCat.data} /> : <Empty>Sem despesas neste mês.</Empty>}
        </Card>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="Evolução do patrimônio"
          table={
            netWorth.data && (
              <DataTable head={["Mês", "Patrimônio"]} rows={netWorth.data.map((n) => [formatMonth(n.month), formatBRL(n.net_worth_cents)])} />
            )
          }
        >
          {netWorth.data && <NetWorthChart data={netWorth.data} />}
        </ChartCard>
        <Card
          className="lg:col-span-2"
          title="Orçamentos"
          action={
            <Link to="/orcamentos" className="text-xs text-accent hover:underline">
              Ver todos
            </Link>
          }
        >
          {topBudgets.length === 0 ? (
            <Empty>
              Nenhum orçamento definido.{" "}
              <Link to="/orcamentos" className="text-accent hover:underline">
                Definir agora
              </Link>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-4">
              {topBudgets.map((b) => {
                const st = budgetStatus(b.spent_cents, b.limit_cents!);
                return (
                  <li key={b.category_id}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: b.category_color }} />
                        {b.category_name}
                      </span>
                      <span className="tabular text-ink-2">
                        {formatBRL(b.spent_cents)} <span className="text-muted">/ {formatBRL(b.limit_cents!)}</span>
                      </span>
                    </div>
                    <BudgetBar spent={b.spent_cents} limit={b.limit_cents!} />
                    <div className="mt-0.5 text-xs text-ink-2">
                      <span aria-hidden style={{ color: st.color }}>
                        {st.icon}
                      </span>{" "}
                      {st.label} · {Math.round(st.pct * 100)}%
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <IdealCard month={month} className="mb-5" />

      <Card
        title="Últimas transações"
        action={
          <Link to="/transacoes" className="text-xs text-accent hover:underline">
            Ver todas
          </Link>
        }
      >
        {recent.data && recent.data.length === 0 ? <Empty>Nenhuma transação neste mês.</Empty> : <TransactionTable rows={recent.data ?? []} />}
      </Card>
    </>
  );
}

function StatTile({
  label,
  value,
  delta,
  upIsGood,
  colorBySign,
  hero,
}: {
  label: string;
  value: number | undefined;
  delta?: number;
  upIsGood: boolean;
  colorBySign?: boolean;
  hero?: boolean;
}) {
  const good = delta !== undefined && delta !== 0 && delta > 0 === upIsGood;
  return (
    <Card>
      <div className="text-sm text-ink-2">{label}</div>
      <div
        className={`mt-1 font-semibold ${hero ? "text-3xl" : "text-2xl"} ${
          colorBySign && value !== undefined && value < 0 ? "text-negative" : ""
        }`}
      >
        {value === undefined ? "—" : formatBRL(value)}
      </div>
      {delta !== undefined && (
        <div className={`mt-1 text-xs ${delta === 0 ? "text-muted" : good ? "text-positive" : "text-negative"}`}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {formatBRL(Math.abs(delta))}
          <span className="text-muted"> vs mês anterior</span>
        </div>
      )}
    </Card>
  );
}

function ChartCard({ title, className, children, table }: { title: string; className?: string; children: ReactNode; table: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card
      className={className}
      title={title}
      action={
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Ver gráfico" : "Ver tabela"}
        </Button>
      }
    >
      {showTable ? table : children}
    </Card>
  );
}
