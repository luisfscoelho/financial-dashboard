import type { Database } from "bun:sqlite";
import { IDEAL_BUCKETS, type IdealBucket, type IdealReport } from "../../shared/types";
import { asBody, badRequest, int } from "../validation";
import { REF_MONTH } from "./transactions";

/** Contas cujo saldo conta como investimento no Ideal. */
const INVESTMENT_TYPES = "('investimento', 'poupanca')";

function splits(db: Database) {
  const rows = db.query<{ bucket: IdealBucket; pct: number }, []>("SELECT bucket, pct FROM ideal_split").all();
  const pct = Object.fromEntries(rows.map((r) => [r.bucket, r.pct])) as Record<IdealBucket, number>;
  return pct;
}

/**
 * Divisão ideal da renda do mês (ex.: 50/30/20) comparada ao realizado:
 * - fixo / livre: despesas do mês (pelo mês de referência) nas categorias de cada grupo; sem categoria conta como livre;
 * - investimento: transferências líquidas para contas de investimento/poupança no mês (pela data).
 */
export function idealReport(db: Database, month: string): IdealReport {
  const totals = db
    .query<{ income: number; fixo: number; livre: number }, { month: string }>(
      `SELECT COALESCE(SUM(CASE WHEN t.kind = 'receita' THEN t.amount_cents END), 0) AS income,
              COALESCE(SUM(CASE WHEN t.kind = 'despesa' AND c.bucket = 'fixo' THEN t.amount_cents END), 0) AS fixo,
              COALESCE(SUM(CASE WHEN t.kind = 'despesa' AND COALESCE(c.bucket, 'livre') = 'livre' THEN t.amount_cents END), 0) AS livre
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${REF_MONTH()} = $month`,
    )
    .get({ month })!;
  // Transferência entre duas contas de investimento soma e subtrai o mesmo valor
  const { investimento } = db
    .query<{ investimento: number }, { month: string }>(
      `SELECT COALESCE(SUM(CASE WHEN ta.type IN ${INVESTMENT_TYPES} THEN t.amount_cents ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN a.type IN ${INVESTMENT_TYPES} THEN t.amount_cents ELSE 0 END), 0) AS investimento
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       JOIN accounts ta ON ta.id = t.to_account_id
       WHERE t.kind = 'transferencia' AND substr(t.date, 1, 7) = $month`,
    )
    .get({ month })!;

  const pct = splits(db);
  const actual: Record<IdealBucket, number> = { fixo: totals.fixo, livre: totals.livre, investimento };
  return {
    month,
    income_cents: totals.income,
    rows: IDEAL_BUCKETS.map((bucket) => ({
      bucket,
      pct: pct[bucket],
      target_cents: Math.round((totals.income * pct[bucket]) / 100),
      actual_cents: actual[bucket],
    })),
  };
}

/** Atualiza os percentuais ideais; os três precisam somar 100. */
export function setSplit(db: Database, input: unknown) {
  const body = asBody(input);
  const values = IDEAL_BUCKETS.map((bucket) => ({ bucket, pct: int(body, bucket, `% ${bucket}`, { min: 0 })! }));
  if (values.some((v) => v.pct > 100)) throw badRequest("Percentual deve estar entre 0 e 100");
  if (values.reduce((s, v) => s + v.pct, 0) !== 100) throw badRequest("Os percentuais precisam somar 100%");
  const update = db.query<never, { bucket: string; pct: number }>("UPDATE ideal_split SET pct = $pct WHERE bucket = $bucket");
  db.transaction(() => values.forEach((v) => update.run(v)))();
  return splits(db);
}
