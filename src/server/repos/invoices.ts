import type { Database } from "bun:sqlite";
import { closingDate, dueDate, invoiceMonthFor, invoiceStatus, type CardCycle } from "../../shared/invoices";
import { addMonths, todayISO } from "../../shared/months";
import type { Invoice } from "../../shared/types";
import { asBody, assertMonth, badRequest, date, int } from "../validation";
import { cardCycle, getAccount } from "./accounts";
import { createTransaction } from "./transactions";

function getCard(db: Database, cardId: number): { cycle: CardCycle; name: string } {
  const account = getAccount(db, cardId);
  const cycle = cardCycle(account);
  if (!cycle) throw badRequest("Configure o dia de fechamento e de vencimento do cartão para ver as faturas");
  return { cycle, name: account.name };
}

/** Faturas do cartão, da mais recente à mais antiga, incluindo sempre a fatura aberta atual. */
export function listInvoices(db: Database, cardId: number, today = todayISO()): Invoice[] {
  const { cycle } = getCard(db, cardId);
  const totals = new Map(
    db
      .query<{ month: string; total: number }, [number]>(
        `SELECT invoice_month AS month,
                SUM(CASE kind WHEN 'despesa' THEN amount_cents ELSE -amount_cents END) AS total
         FROM transactions WHERE account_id = ? AND invoice_month IS NOT NULL GROUP BY 1`,
      )
      .all(cardId)
      .map((r) => [r.month, r.total]),
  );
  const paid = new Map(
    db
      .query<{ month: string; paid: number }, [number]>(
        `SELECT invoice_payment_for AS month, SUM(amount_cents) AS paid
         FROM transactions WHERE to_account_id = ? AND kind = 'transferencia' AND invoice_payment_for IS NOT NULL GROUP BY 1`,
      )
      .all(cardId)
      .map((r) => [r.month, r.paid]),
  );

  const current = invoiceMonthFor(today, cycle);
  const months = [...totals.keys(), ...paid.keys(), current].sort();
  const result: Invoice[] = [];
  for (let m = months[0]!; m <= months.at(-1)!; m = addMonths(m, 1)) {
    const total_cents = totals.get(m) ?? 0;
    const paid_cents = paid.get(m) ?? 0;
    result.push({
      month: m,
      closing_date: closingDate(m, cycle),
      due_date: dueDate(m, cycle),
      total_cents,
      paid_cents,
      status: invoiceStatus(m, cycle, total_cents, paid_cents, today),
    });
  }
  return result.reverse();
}

/** Registra o pagamento de uma fatura como transferência da conta escolhida para o cartão. */
export function payInvoice(db: Database, cardId: number, month: string, input: unknown) {
  const { name } = getCard(db, cardId);
  assertMonth(month, "Fatura");
  const body = asBody(input);
  const fromId = int(body, "account_id", "Conta de pagamento")!;
  if (getAccount(db, fromId).type === "cartao") throw badRequest("Pague a fatura a partir de uma conta que não seja cartão");
  const [y, m] = month.split("-");
  return createTransaction(db, {
    kind: "transferencia",
    account_id: fromId,
    to_account_id: cardId,
    amount_cents: int(body, "amount_cents", "Valor", { min: 1 }),
    date: date(body, "date", "Data"),
    description: `Pagamento fatura ${m}/${y} · ${name}`,
    invoice_payment_for: month,
  });
}
