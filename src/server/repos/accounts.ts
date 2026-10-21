import type { Database } from "bun:sqlite";
import { ACCOUNT_TYPES, type Account, type AccountWithBalance } from "../../shared/types";
import { asBody, badRequest, int, notFound, oneOf, str } from "../validation";

/**
 * Saldo = saldo inicial + receitas − despesas − transferências enviadas + transferências recebidas,
 * considerando apenas lançamentos com data <= :asOf.
 */
const BALANCE_SQL = `
  a.initial_balance_cents
  + COALESCE((
      SELECT SUM(CASE WHEN t.kind = 'receita' THEN t.amount_cents ELSE -t.amount_cents END)
      FROM transactions t WHERE t.account_id = a.id AND t.date <= $asOf
    ), 0)
  + COALESCE((
      SELECT SUM(t.amount_cents) FROM transactions t WHERE t.to_account_id = a.id AND t.date <= $asOf
    ), 0)
`;

const FAR_FUTURE = "9999-12-31";

export function listAccounts(db: Database, opts: { includeArchived?: boolean; asOf?: string } = {}) {
  return db
    .query<AccountWithBalance, { asOf: string; all: number }>(
      `SELECT a.*, ${BALANCE_SQL} AS balance_cents
       FROM accounts a
       WHERE $all = 1 OR a.archived = 0
       ORDER BY a.archived, a.name COLLATE NOCASE`,
    )
    .all({ asOf: opts.asOf ?? FAR_FUTURE, all: opts.includeArchived ? 1 : 0 });
}

export function getAccount(db: Database, id: number) {
  const row = db.query<Account, [number]>("SELECT * FROM accounts WHERE id = ?").get(id);
  if (!row) throw notFound("Conta");
  return row;
}

function parse(input: unknown) {
  const body = asBody(input);
  const name = str(body, "name", "Nome");
  return {
    name,
    type: oneOf(body, "type", "Tipo de conta", ACCOUNT_TYPES),
    initial_balance_cents: int(body, "initial_balance_cents", "Saldo inicial", { optional: true }) ?? 0,
    archived: body.archived ? 1 : 0,
  };
}

export function createAccount(db: Database, input: unknown) {
  const a = parse(input);
  return db
    .query<Account, typeof a>(
      `INSERT INTO accounts (name, type, initial_balance_cents, archived)
       VALUES ($name, $type, $initial_balance_cents, $archived) RETURNING *`,
    )
    .get(a)!;
}

export function updateAccount(db: Database, id: number, input: unknown) {
  getAccount(db, id);
  const a = parse(input);
  return db
    .query<Account, typeof a & { id: number }>(
      `UPDATE accounts SET name = $name, type = $type, initial_balance_cents = $initial_balance_cents,
       archived = $archived WHERE id = $id RETURNING *`,
    )
    .get({ ...a, id })!;
}

export function deleteAccount(db: Database, id: number) {
  getAccount(db, id);
  const { n } = db
    .query<{ n: number }, [number, number]>(
      "SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?",
    )
    .get(id, id)!;
  if (n > 0) throw badRequest(`A conta possui ${n} transação(ões). Arquive-a em vez de excluir.`);
  db.query("DELETE FROM accounts WHERE id = ?").run(id);
}
