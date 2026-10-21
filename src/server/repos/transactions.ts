import type { Database } from "bun:sqlite";
import { MAX_INSTALLMENTS, type Transaction, type TransactionFilters, type TransactionView } from "../../shared/types";
import { invoiceMonthFor } from "../../shared/invoices";
import { addMonths, addMonthsToDate, splitInstallments } from "../../shared/months";
import { asBody, assertMonth, badRequest, date, int, notFound, oneOf, str } from "../validation";
import { cardCycle, getAccount } from "./accounts";
import { getCategory } from "./categories";

/**
 * Mês em que o lançamento conta em relatórios e orçamentos: a fatura, para compras em cartão com
 * ciclo configurado; senão, o mês da data.
 */
export const REF_MONTH = (alias = "t") => `COALESCE(${alias}.invoice_month, substr(${alias}.date, 1, 7))`;

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
    where.push(`${REF_MONTH()} = $month`);
    params.month = f.month;
  }
  if (f.invoice) {
    // Lançamentos da fatura + pagamentos que a quitam
    where.push("(t.invoice_month = $invoice OR t.invoice_payment_for = $invoice)");
    params.invoice = f.invoice;
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
    invoice_payment_for: null as string | null,
  };
  const account = getAccount(db, t.account_id);

  if (kind === "transferencia") {
    t.to_account_id = int(body, "to_account_id", "Conta de destino")!;
    if (t.to_account_id === t.account_id) throw badRequest("A conta de destino deve ser diferente da origem");
    const to = getAccount(db, t.to_account_id);
    if (body.invoice_payment_for) {
      t.invoice_payment_for = assertMonth(body.invoice_payment_for as string, "Fatura");
      if (!cardCycle(to)) throw badRequest("Pagamento de fatura só vale para cartão com fechamento configurado");
    }
  } else {
    t.category_id = int(body, "category_id", "Categoria", { optional: true });
    if (t.category_id !== null) {
      const cat = getCategory(db, t.category_id);
      if (cat.kind !== kind) throw badRequest(`A categoria "${cat.name}" não é de ${kind}`);
    }
  }
  return { t, account, body };
}

type Parsed = ReturnType<typeof parse>;
type NewTransaction = Parsed["t"] & {
  installment_plan_id: number | null;
  installment_number: number | null;
  invoice_month: string | null;
};

function insert(db: Database, t: NewTransaction) {
  return db
    .query<Pick<Transaction, "id">, NewTransaction>(
      `INSERT INTO transactions (kind, account_id, amount_cents, date, description, category_id, to_account_id,
                                 installment_plan_id, installment_number, invoice_month, invoice_payment_for)
       VALUES ($kind, $account_id, $amount_cents, $date, $description, $category_id, $to_account_id,
               $installment_plan_id, $installment_number, $invoice_month, $invoice_payment_for) RETURNING id`,
    )
    .get(t)!.id;
}

/** Fatura em que um lançamento entra (null se não for compra/estorno em cartão com ciclo). */
function invoiceFor({ t, account }: Pick<Parsed, "t" | "account">): string | null {
  const cycle = cardCycle(account);
  return cycle && t.kind !== "transferencia" ? invoiceMonthFor(t.date, cycle) : null;
}

/**
 * Cria uma transação. Com `installments` >= 2 (só despesas no cartão de crédito), `amount_cents` é o valor
 * total da compra: cria um plano e uma parcela por mês a partir de `date`. Retorna a (primeira) transação.
 */
export function createTransaction(db: Database, input: unknown) {
  const { t, account, body } = parse(db, input);
  const installments = int(body, "installments", "Parcelas", { optional: true, min: 1 }) ?? 1;
  const invoice = invoiceFor({ t, account });
  if (installments === 1) {
    return getTransaction(db, insert(db, { ...t, installment_plan_id: null, installment_number: null, invoice_month: invoice }));
  }

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
        // Uma parcela por fatura a partir da fatura da compra
        invoice_month: invoice && addMonths(invoice, i),
      }),
    );
    return getTransaction(db, ids[0]!);
  })();
}

/** Edita uma única transação; uma parcela continua ligada ao plano e precisa seguir como despesa no cartão. */
export function updateTransaction(db: Database, id: number, input: unknown) {
  const current = getTransaction(db, id);
  const { t, account, body } = parse(db, input);
  if (current.installment_plan_id !== null && (t.kind !== "despesa" || account.type !== "cartao")) {
    throw badRequest("Uma parcela precisa continuar como despesa no cartão de crédito");
  }
  // Mantém a fatura se conta e data não mudaram (preserva o deslocamento das parcelas)
  const sameSlot = current.account_id === t.account_id && current.date === t.date && current.kind !== "transferencia";
  const invoice_month = sameSlot && current.invoice_month && t.kind !== "transferencia" ? current.invoice_month : invoiceFor({ t, account });
  // Pagamento de fatura: o formulário comum não envia o campo; preserva o vínculo se o destino não mudou
  if (!("invoice_payment_for" in body) && t.kind === "transferencia" && t.to_account_id === current.to_account_id) {
    t.invoice_payment_for = current.invoice_payment_for;
  }
  db.query<never, typeof t & { id: number; invoice_month: string | null }>(
    `UPDATE transactions SET kind = $kind, account_id = $account_id, amount_cents = $amount_cents, date = $date,
     description = $description, category_id = $category_id, to_account_id = $to_account_id,
     invoice_month = $invoice_month, invoice_payment_for = $invoice_payment_for WHERE id = $id`,
  ).run({ ...t, id, invoice_month });
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
