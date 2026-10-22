import type { Database } from "bun:sqlite";
import { type CardCycle, invoiceMonthFor } from "../../shared/invoices";
import { addMonths, todayISO } from "../../shared/months";
import { ACCOUNT_TYPES, type Account, type AccountWithBalance } from "../../shared/types";
import { asBody, badRequest, int, notFound, oneOf, str } from "../validation";

/**
 * Movimento líquido da conta = receitas − despesas − transferências enviadas + transferências recebidas,
 * considerando apenas lançamentos cuja data satisfaz `cond` (ex.: "<= $asOf").
 */
const movement = (cond: string) => `
  COALESCE((
    SELECT SUM(CASE WHEN t.kind = 'receita' THEN t.amount_cents ELSE -t.amount_cents END)
    FROM transactions t WHERE t.account_id = a.id AND t.date ${cond}
  ), 0)
  + COALESCE((
    SELECT SUM(t.amount_cents) FROM transactions t WHERE t.to_account_id = a.id AND t.date ${cond}
  ), 0)
`;

/** Saldo até `asOf` (padrão: hoje) e, separado, o total de lançamentos futuros (ex.: parcelas a vencer). */
export function listAccounts(db: Database, opts: { includeArchived?: boolean; asOf?: string } = {}) {
  return db
    .query<AccountWithBalance, { asOf: string; all: number }>(
      `SELECT a.*,
              a.initial_balance_cents + ${movement("<= $asOf")} AS balance_cents,
              ${movement("> $asOf")} AS future_cents
       FROM accounts a
       WHERE $all = 1 OR a.archived = 0
       ORDER BY a.archived, a.name COLLATE NOCASE`,
    )
    .all({ asOf: opts.asOf ?? todayISO(), all: opts.includeArchived ? 1 : 0 });
}

export function getAccount(db: Database, id: number) {
  const row = db.query<Account, [number]>("SELECT * FROM accounts WHERE id = ?").get(id);
  if (!row) throw notFound("Conta");
  return row;
}

function parse(input: unknown) {
  const body = asBody(input);
  const name = str(body, "name", "Nome");
  const type = oneOf(body, "type", "Tipo de conta", ACCOUNT_TYPES);
  let closing_day: number | null = null;
  let due_day: number | null = null;
  if (type === "cartao") {
    closing_day = int(body, "closing_day", "Dia de fechamento", { optional: true, min: 1 });
    due_day = int(body, "due_day", "Dia de vencimento", { optional: true, min: 1 });
    if ((closing_day === null) !== (due_day === null)) throw badRequest("Informe o dia de fechamento e o de vencimento");
    if ((closing_day ?? 0) > 31 || (due_day ?? 0) > 31) throw badRequest("Dia deve estar entre 1 e 31");
  }
  return {
    name,
    type,
    initial_balance_cents: int(body, "initial_balance_cents", "Saldo inicial", { optional: true }) ?? 0,
    archived: body.archived ? 1 : 0,
    closing_day,
    due_day,
  };
}

export function createAccount(db: Database, input: unknown) {
  const a = parse(input);
  return db
    .query<Account, typeof a>(
      `INSERT INTO accounts (name, type, initial_balance_cents, archived, closing_day, due_day)
       VALUES ($name, $type, $initial_balance_cents, $archived, $closing_day, $due_day) RETURNING *`,
    )
    .get(a)!;
}

export function updateAccount(db: Database, id: number, input: unknown) {
  const current = getAccount(db, id);
  const a = parse(input);
  if (current.type === "cartao" && a.type !== "cartao") {
    const { n } = db
      .query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? AND installment_plan_id IS NOT NULL")
      .get(id)!;
    if (n > 0) throw badRequest("Esta conta tem compras parceladas; ela precisa continuar como cartão de crédito");
  }
  return db.transaction(() => {
    const updated = db
      .query<Account, typeof a & { id: number }>(
        `UPDATE accounts SET name = $name, type = $type, initial_balance_cents = $initial_balance_cents,
         archived = $archived, closing_day = $closing_day, due_day = $due_day WHERE id = $id RETURNING *`,
      )
      .get({ ...a, id })!;
    if (current.closing_day !== a.closing_day || current.due_day !== a.due_day) recomputeInvoiceMonths(db, updated);
    return updated;
  })();
}

/** Ciclo de fatura da conta, ou null se ela não for um cartão com fechamento configurado. */
export function cardCycle(a: Pick<Account, "type" | "closing_day" | "due_day">): CardCycle | null {
  return a.type === "cartao" && a.closing_day && a.due_day ? { closing_day: a.closing_day, due_day: a.due_day } : null;
}

/**
 * Recalcula a fatura de cada lançamento do cartão após mudar o ciclo. Parcelas seguem a fatura da
 * 1ª parcela (data da compra) + (n − 1), para continuarem uma por fatura.
 */
function recomputeInvoiceMonths(db: Database, account: Account) {
  const cycle = cardCycle(account);
  if (!cycle) {
    db.query("UPDATE transactions SET invoice_month = NULL WHERE account_id = ?").run(account.id);
    return;
  }
  const rows = db
    .query<{ id: number; date: string; installment_number: number | null; first_date: string | null }, [number]>(
      `SELECT t.id, t.date, t.installment_number,
              (SELECT f.date FROM transactions f
               WHERE f.installment_plan_id = t.installment_plan_id AND f.installment_number = 1) AS first_date
       FROM transactions t WHERE t.account_id = ? AND t.kind <> 'transferencia'`,
    )
    .all(account.id);
  const update = db.query<never, [string, number]>("UPDATE transactions SET invoice_month = ? WHERE id = ?");
  for (const r of rows) {
    const month =
      r.installment_number && r.first_date
        ? addMonths(invoiceMonthFor(r.first_date, cycle), r.installment_number - 1)
        : invoiceMonthFor(r.date, cycle);
    update.run(month, r.id);
  }
}

export function deleteAccount(db: Database, id: number) {
  getAccount(db, id);
  const { n } = db
    .query<{ n: number }, [number, number]>(
      "SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?",
    )
    .get(id, id)!;
  if (n > 0) throw badRequest(`A conta possui ${n} transação(ões). Arquive-a em vez de excluir.`);
  const goals = db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM goals WHERE account_id = ?").get(id)!.n;
  if (goals > 0) throw badRequest("A conta está vinculada a uma meta. Remova ou altere a meta antes de excluir.");
  db.query("DELETE FROM accounts WHERE id = ?").run(id);
}
