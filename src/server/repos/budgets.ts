import type { Database } from "bun:sqlite";
import type { BudgetRow } from "../../shared/types";
import { addMonths, monthBounds } from "../../shared/months";
import { asBody, assertMonth, badRequest, int, notFound } from "../validation";
import { getCategory } from "./categories";

/** Uma linha por categoria de despesa: limite do mês (se houver) e quanto já foi gasto. */
export function listBudgets(db: Database, month: string) {
  const [from, to] = monthBounds(month);
  return db
    .query<BudgetRow, { month: string; from: string; to: string }>(
      `SELECT b.id, c.id AS category_id, c.name AS category_name, c.color AS category_color,
              $month AS month, b.limit_cents,
              COALESCE((
                SELECT SUM(t.amount_cents) FROM transactions t
                WHERE t.category_id = c.id AND t.kind = 'despesa' AND t.date BETWEEN $from AND $to
              ), 0) AS spent_cents
       FROM categories c
       LEFT JOIN budgets b ON b.category_id = c.id AND b.month = $month
       WHERE c.kind = 'despesa'
       ORDER BY b.id IS NULL, c.name COLLATE NOCASE`,
    )
    .all({ month, from, to });
}

export function upsertBudget(db: Database, input: unknown) {
  const body = asBody(input);
  const category_id = int(body, "category_id", "Categoria")!;
  const month = assertMonth(body.month as string);
  const limit_cents = int(body, "limit_cents", "Limite", { min: 1 })!;
  if (getCategory(db, category_id).kind !== "despesa") throw badRequest("Orçamentos só valem para despesas");
  db.query(
    `INSERT INTO budgets (category_id, month, limit_cents) VALUES ($category_id, $month, $limit_cents)
     ON CONFLICT (category_id, month) DO UPDATE SET limit_cents = excluded.limit_cents`,
  ).run({ category_id, month, limit_cents });
  return listBudgets(db, month).find((b) => b.category_id === category_id)!;
}

export function deleteBudget(db: Database, id: number) {
  const res = db.query("DELETE FROM budgets WHERE id = ?").run(id);
  if (res.changes === 0) throw notFound("Orçamento");
}

/** Copia os limites do mês anterior para categorias que ainda não têm orçamento no mês. */
export function copyPreviousMonth(db: Database, month: string) {
  const res = db
    .query(
      `INSERT INTO budgets (category_id, month, limit_cents)
       SELECT category_id, $month, limit_cents FROM budgets WHERE month = $prev
       ON CONFLICT (category_id, month) DO NOTHING`,
    )
    .run({ month, prev: addMonths(month, -1) });
  return res.changes;
}
