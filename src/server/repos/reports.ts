import type { Database } from "bun:sqlite";
import type { CashflowPoint, CategoryKind, CategoryTotal, MonthSummary, NetWorthPoint } from "../../shared/types";
import { monthBounds, monthRange } from "../../shared/months";
import { REF_MONTH } from "./transactions";

const OTHER_COLOR = "#898781";

/**
 * Receitas e despesas por mês entre `fromMonth` e `toMonth`. `by: "ref"` agrupa pelo mês de referência
 * (fatura do cartão, quando houver) — usado em relatórios; `by: "date"` agrupa pela data — usado no patrimônio.
 */
function monthTotals(db: Database, fromMonth: string, toMonth: string, by: "ref" | "date") {
  const monthExpr = by === "ref" ? REF_MONTH() : "substr(t.date, 1, 7)";
  return db
    .query<{ month: string; income_cents: number; expense_cents: number }, { from: string; to: string }>(
      `SELECT ${monthExpr} AS month,
              SUM(CASE WHEN t.kind = 'receita' THEN t.amount_cents ELSE 0 END) AS income_cents,
              SUM(CASE WHEN t.kind = 'despesa' THEN t.amount_cents ELSE 0 END) AS expense_cents
       FROM transactions t WHERE ${monthExpr} BETWEEN $from AND $to
       GROUP BY 1`,
    )
    .all({ from: fromMonth, to: toMonth });
}

/** Patrimônio em uma data = soma dos saldos iniciais + receitas − despesas (transferências se anulam). */
function netWorthAt(db: Database, asOf: string) {
  return db
    .query<{ v: number }, { asOf: string }>(
      `SELECT (SELECT COALESCE(SUM(initial_balance_cents), 0) FROM accounts)
            + (SELECT COALESCE(SUM(CASE kind WHEN 'receita' THEN amount_cents WHEN 'despesa' THEN -amount_cents ELSE 0 END), 0)
               FROM transactions WHERE date <= $asOf) AS v`,
    )
    .get({ asOf })!.v;
}

export function monthSummary(db: Database, month: string): MonthSummary {
  const row = monthTotals(db, month, month, "ref")[0];
  const income = row?.income_cents ?? 0;
  const expense = row?.expense_cents ?? 0;
  return {
    month,
    income_cents: income,
    expense_cents: expense,
    net_cents: income - expense,
    net_worth_cents: netWorthAt(db, monthBounds(month)[1]),
  };
}

/** Totais por categoria no mês, do maior para o menor; transações sem categoria aparecem como "Sem categoria". */
export function byCategory(db: Database, month: string, kind: CategoryKind): CategoryTotal[] {
  return db
    .query<CategoryTotal, { month: string; kind: string; other: string }>(
      `SELECT t.category_id, COALESCE(c.name, 'Sem categoria') AS name, COALESCE(c.color, $other) AS color,
              SUM(t.amount_cents) AS total_cents
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.kind = $kind AND ${REF_MONTH()} = $month
       GROUP BY t.category_id ORDER BY total_cents DESC`,
    )
    .all({ month, kind, other: OTHER_COLOR });
}

export function cashflow(db: Database, endMonth: string, months: number): CashflowPoint[] {
  const range = monthRange(endMonth, months);
  const totals = new Map(monthTotals(db, range[0]!, endMonth, "ref").map((r) => [r.month, r]));
  return range.map((month) => ({
    month,
    income_cents: totals.get(month)?.income_cents ?? 0,
    expense_cents: totals.get(month)?.expense_cents ?? 0,
  }));
}

export function netWorthSeries(db: Database, endMonth: string, months: number): NetWorthPoint[] {
  const range = monthRange(endMonth, months);
  const start = monthBounds(range[0]!)[0];
  // Patrimônio até o dia anterior ao início da série, depois acumula mês a mês.
  let running = netWorthAt(db, prevDay(start));
  const totals = new Map(monthTotals(db, range[0]!, endMonth, "date").map((r) => [r.month, r]));
  return range.map((month) => {
    const t = totals.get(month);
    running += (t?.income_cents ?? 0) - (t?.expense_cents ?? 0);
    return { month, net_worth_cents: running };
  });
}

function prevDay(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
