import type { Database } from "bun:sqlite";
import { MAX_INSTALLMENTS, type Transaction, type TransactionFilters, type TransactionView } from "../../shared/types";
import { addMonthsToDate, monthBounds, splitInstallments } from "../../shared/months";
import { asBody, badRequest, date, int, notFound, oneOf, str } from "../validation";
import { getAccount } from "./accounts";
import { getCategory } from "./categories";

const VIEW_SQL = `
  SELECT t.*, a.name AS account_name, a.type AS account_type, ta.name AS to_account_name,
         c.name AS category_name, c.color AS category_color,
         p.count AS installment_total, p.total_cents AS installment_plan_total_cents
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN installment_plans p ON p.id = t.installment_plan_id
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
  const account = getAccount(db, t.account_id);

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
  return { t, account, body };
}

type NewTransaction = ReturnType<typeof parse>["t"] & { installment_plan_id: number | null; installment_number: number | null };

function insert(db: Database, t: NewTransaction) {
  return db
    .query<Pick<Transaction, "id">, NewTransaction>(
      `INSERT INTO transactions (kind, account_id, amount_cents, date, description, category_id, to_account_id,
                                 installment_plan_id, installment_number)
       VALUES ($kind, $account_id, $amount_cents, $date, $description, $category_id, $to_account_id,
               $installment_plan_id, $installment_number) RETURNING id`,
    )
    .get(t)!.id;
}

/**
 * Cria uma transação. Com `installments` >= 2 (só despesas no cartão de crédito), `amount_cents` é o valor
 * total da compra: cria um plano e uma parcela por mês a partir de `date`. Retorna a (primeira) transação.
 */
export function createTransaction(db: Database, input: unknown) {
  const { t, account, body } = parse(db, input);
  const installments = int(body, "installments", "Parcelas", { optional: true, min: 1 }) ?? 1;
  if (installments === 1) return getTransaction(db, insert(db, { ...t, installment_plan_id: null, installment_number: null }));

  if (installments > MAX_INSTALLMENTS) throw badRequest(`Máximo de ${MAX_INSTALLMENTS} parcelas`);
  if (t.kind !== "despesa" || account.type !== "cartao") {
    throw badRequest("Parcelamento só é permitido para despesas no cartão de crédito");
  }
  if (t.amount_cents < installments) throw badRequest("Valor total menor que o número de parcelas");

  return db.transaction(() => {
    const plan = db
      .query<{ id: number }, [number, number]>("INSERT INTO installment_plans (total_cents, count) VALUES (?, ?) RETURNING id")
      .get(t.amount_cents, installments)!.id;
    const ids = splitInstallments(t.amount_cents, installments).map((amount, i) =>
      insert(db, {
        ...t,
        amount_cents: amount,
        date: addMonthsToDate(t.date, i),
        installment_plan_id: plan,
        installment_number: i + 1,
      }),
    );
    return getTransaction(db, ids[0]!);
  })();
}

/** Edita uma única transação; uma parcela continua ligada ao plano e precisa seguir como despesa no cartão. */
export function updateTransaction(db: Database, id: number, input: unknown) {
  const current = getTransaction(db, id);
  const { t, account } = parse(db, input);
  if (current.installment_plan_id !== null && (t.kind !== "despesa" || account.type !== "cartao")) {
    throw badRequest("Uma parcela precisa continuar como despesa no cartão de crédito");
  }
  db.query<never, typeof t & { id: number }>(
    `UPDATE transactions SET kind = $kind, account_id = $account_id, amount_cents = $amount_cents, date = $date,
     description = $description, category_id = $category_id, to_account_id = $to_account_id WHERE id = $id`,
  ).run({ ...t, id });
  return getTransaction(db, id);
}

export function deleteTransaction(db: Database, id: number) {
  const t = getTransaction(db, id);
  db.transaction(() => {
    db.query("DELETE FROM transactions WHERE id = ?").run(id);
    // Remove o plano quando a última parcela é excluída
    if (t.installment_plan_id !== null) {
      db.query("DELETE FROM installment_plans WHERE id = ? AND NOT EXISTS (SELECT 1 FROM transactions WHERE installment_plan_id = ?)").run(
        t.installment_plan_id,
        t.installment_plan_id,
      );
    }
  })();
}

/** Exclui a compra parcelada inteira (todas as parcelas, por cascata). */
export function deleteInstallmentPlan(db: Database, planId: number) {
  const res = db.query("DELETE FROM installment_plans WHERE id = ?").run(planId);
  if (res.changes === 0) throw notFound("Parcelamento");
}
