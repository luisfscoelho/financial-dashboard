import type { Database } from "bun:sqlite";
import type { Transaction, TransactionFilters, TransactionView } from "../../shared/types";
import { monthBounds } from "../../shared/months";
import { asBody, badRequest, date, int, notFound, oneOf, str } from "../validation";
import { getAccount } from "./accounts";
import { getCategory } from "./categories";

const VIEW_SQL = `
  SELECT t.*, a.name AS account_name, ta.name AS to_account_name,
         c.name AS category_name, c.color AS category_color
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id
  LEFT JOIN categories c ON c.id = t.category_id
`;

export function listTransactions(db: Database, f: TransactionFilters = {}) {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (f.month) {
    const [from, to] = monthBounds(f.month);
    where.push("t.date BETWEEN $from AND $to");
    Object.assign(params, { from, to });
  }
  if (f.account) {
    where.push("(t.account_id = $account OR t.to_account_id = $account)");
    params.account = f.account;
  }
  if (f.category) {
    where.push("t.category_id = $category");
    params.category = f.category;
  }
  if (f.kind) {
    where.push("t.kind = $kind");
    params.kind = f.kind;
  }
  if (f.q) {
    where.push("t.description LIKE $q");
    params.q = `%${f.q}%`;
  }
  const sql =
    VIEW_SQL +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY t.date DESC, t.id DESC" +
    (f.limit ? ` LIMIT ${Math.trunc(f.limit)}` : "");
  return db.query<TransactionView, typeof params>(sql).all(params);
}

export function getTransaction(db: Database, id: number) {
  const row = db.query<TransactionView, [number]>(`${VIEW_SQL} WHERE t.id = ?`).get(id);
  if (!row) throw notFound("Transação");
  return row;
}

function parse(db: Database, input: unknown) {
  const body = asBody(input);
  const kind = oneOf(body, "kind", "Tipo", ["receita", "despesa", "transferencia"] as const);
  const t = {
    kind,
    account_id: int(body, "account_id", "Conta")!,
    amount_cents: int(body, "amount_cents", "Valor", { min: 1 })!,
    date: date(body, "date", "Data"),
    description: str(body, "description", "Descrição", { optional: true }),
    category_id: null as number | null,
    to_account_id: null as number | null,
  };
  getAccount(db, t.account_id);

  if (kind === "transferencia") {
    t.to_account_id = int(body, "to_account_id", "Conta de destino")!;
    if (t.to_account_id === t.account_id) throw badRequest("A conta de destino deve ser diferente da origem");
    getAccount(db, t.to_account_id);
  } else {
    t.category_id = int(body, "category_id", "Categoria", { optional: true });
    if (t.category_id !== null) {
      const cat = getCategory(db, t.category_id);
      if (cat.kind !== kind) throw badRequest(`A categoria "${cat.name}" não é de ${kind}`);
    }
  }
  return t;
}

export function createTransaction(db: Database, input: unknown) {
  const t = parse(db, input);
  const { id } = db
    .query<Pick<Transaction, "id">, typeof t>(
      `INSERT INTO transactions (kind, account_id, amount_cents, date, description, category_id, to_account_id)
       VALUES ($kind, $account_id, $amount_cents, $date, $description, $category_id, $to_account_id) RETURNING id`,
    )
    .get(t)!;
  return getTransaction(db, id);
}

export function updateTransaction(db: Database, id: number, input: unknown) {
  getTransaction(db, id);
  const t = parse(db, input);
  db.query<never, typeof t & { id: number }>(
    `UPDATE transactions SET kind = $kind, account_id = $account_id, amount_cents = $amount_cents, date = $date,
     description = $description, category_id = $category_id, to_account_id = $to_account_id WHERE id = $id`,
  ).run({ ...t, id });
  return getTransaction(db, id);
}

export function deleteTransaction(db: Database, id: number) {
  getTransaction(db, id);
  db.query("DELETE FROM transactions WHERE id = ?").run(id);
}
