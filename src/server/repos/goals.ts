import type { Database } from "bun:sqlite";
import type { Goal, GoalView } from "../../shared/types";
import { asBody, assertMonth, int, notFound, str } from "../validation";
import { getAccount, listAccounts } from "./accounts";

/** Metas com o valor atual = saldo de hoje da conta vinculada. */
export function listGoals(db: Database): GoalView[] {
  const balances = new Map(listAccounts(db, { includeArchived: true }).map((a) => [a.id, a]));
  return db
    .query<Goal, []>("SELECT * FROM goals ORDER BY name COLLATE NOCASE")
    .all()
    .map((g) => {
      const a = balances.get(g.account_id)!;
      return { ...g, account_name: a.name, current_cents: a.balance_cents };
    });
}

function getGoal(db: Database, id: number) {
  const row = db.query<Goal, [number]>("SELECT * FROM goals WHERE id = ?").get(id);
  if (!row) throw notFound("Meta");
  return row;
}

function parse(db: Database, input: unknown) {
  const body = asBody(input);
  const account_id = int(body, "account_id", "Conta")!;
  getAccount(db, account_id);
  return {
    name: str(body, "name", "Nome"),
    target_cents: int(body, "target_cents", "Valor da meta", { min: 1 })!,
    account_id,
    target_month: body.target_month ? assertMonth(body.target_month as string, "Prazo") : null,
  };
}

const view = (db: Database, id: number) => listGoals(db).find((g) => g.id === id)!;

export function createGoal(db: Database, input: unknown) {
  const g = parse(db, input);
  const { id } = db
    .query<{ id: number }, typeof g>(
      `INSERT INTO goals (name, target_cents, account_id, target_month)
       VALUES ($name, $target_cents, $account_id, $target_month) RETURNING id`,
    )
    .get(g)!;
  return view(db, id);
}

export function updateGoal(db: Database, id: number, input: unknown) {
  getGoal(db, id);
  const g = parse(db, input);
  db.query<never, typeof g & { id: number }>(
    `UPDATE goals SET name = $name, target_cents = $target_cents, account_id = $account_id,
     target_month = $target_month WHERE id = $id`,
  ).run({ ...g, id });
  return view(db, id);
}

export function deleteGoal(db: Database, id: number) {
  const res = db.query("DELETE FROM goals WHERE id = ?").run(id);
  if (res.changes === 0) throw notFound("Meta");
}
