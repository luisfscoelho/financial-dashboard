import type { Database } from "bun:sqlite";
import { todayISO } from "../../shared/months";
import type { Subscription, SubscriptionView } from "../../shared/types";
import { asBody, badRequest, date, int, notFound, oneOf, str } from "../validation";
import { getAccount } from "./accounts";
import { getCategory } from "./categories";
import { createTransaction } from "./transactions";

const VIEW_SQL = `
  SELECT s.*, a.name AS account_name, c.name AS category_name, c.color AS category_color
  FROM subscriptions s
  LEFT JOIN accounts a ON a.id = s.account_id
  LEFT JOIN categories c ON c.id = s.category_id
`;

export function listSubscriptions(db: Database) {
  return db
    .query<SubscriptionView, []>(`${VIEW_SQL} ORDER BY s.active DESC, s.period, s.renewal_month, s.name COLLATE NOCASE`)
    .all();
}

export function getSubscription(db: Database, id: number) {
  const row = db.query<SubscriptionView, [number]>(`${VIEW_SQL} WHERE s.id = ?`).get(id);
  if (!row) throw notFound("Assinatura");
  return row;
}

function parse(db: Database, input: unknown) {
  const body = asBody(input);
  const period = oneOf(body, "period", "Período", ["mensal", "anual"] as const);
  let renewal_month: number | null = null;
  if (period === "anual") {
    renewal_month = int(body, "renewal_month", "Mês de renovação", { min: 1 })!;
    if (renewal_month > 12) throw badRequest("Mês de renovação deve estar entre 1 e 12");
  }
  const account_id = int(body, "account_id", "Conta", { optional: true });
  if (account_id !== null) getAccount(db, account_id);
  const category_id = int(body, "category_id", "Categoria", { optional: true });
  if (category_id !== null && getCategory(db, category_id).kind !== "despesa") {
    throw badRequest("A categoria de uma assinatura precisa ser de despesa");
  }
  return {
    name: str(body, "name", "Nome"),
    amount_cents: int(body, "amount_cents", "Valor", { min: 1 })!,
    period,
    renewal_month,
    account_id,
    category_id,
    active: body.active === false || body.active === 0 ? 0 : 1,
  };
}

export function createSubscription(db: Database, input: unknown) {
  const s = parse(db, input);
  const { id } = db
    .query<Pick<Subscription, "id">, typeof s>(
      `INSERT INTO subscriptions (name, amount_cents, period, renewal_month, account_id, category_id, active)
       VALUES ($name, $amount_cents, $period, $renewal_month, $account_id, $category_id, $active) RETURNING id`,
    )
    .get(s)!;
  return getSubscription(db, id);
}

export function updateSubscription(db: Database, id: number, input: unknown) {
  getSubscription(db, id);
  const s = parse(db, input);
  db.query<never, typeof s & { id: number }>(
    `UPDATE subscriptions SET name = $name, amount_cents = $amount_cents, period = $period, renewal_month = $renewal_month,
     account_id = $account_id, category_id = $category_id, active = $active WHERE id = $id`,
  ).run({ ...s, id });
  return getSubscription(db, id);
}

export function deleteSubscription(db: Database, id: number) {
  const res = db.query("DELETE FROM subscriptions WHERE id = ?").run(id);
  if (res.changes === 0) throw notFound("Assinatura");
}

/** Lança a cobrança da assinatura como despesa na conta dela (data padrão: hoje). */
export function launchSubscription(db: Database, id: number, input: unknown = {}) {
  const s = getSubscription(db, id);
  if (s.account_id === null) throw badRequest("Defina a conta da assinatura antes de lançar a cobrança");
  const body = asBody(input);
  return createTransaction(db, {
    kind: "despesa",
    account_id: s.account_id,
    category_id: s.category_id,
    amount_cents: s.amount_cents,
    date: body.date ? date(body, "date", "Data") : todayISO(),
    description: s.name,
  });
}
