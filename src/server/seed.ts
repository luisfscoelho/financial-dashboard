/**
 * Popula o banco com ~12 meses de dados de exemplo.
 * Uso: bun run seed            (só roda se o banco não tiver transações)
 *      bun run seed --force    (apaga contas, transações e orçamentos antes)
 */
import { addMonths, currentMonth, monthRange, todayISO } from "../shared/months";
import { openDb } from "./db";
import { createAccount } from "./repos/accounts";
import { listInvoices, payInvoice } from "./repos/invoices";
import { upsertBudget } from "./repos/budgets";
import { listCategories } from "./repos/categories";
import { createTransaction } from "./repos/transactions";

const db = openDb();
const force = process.argv.includes("--force");

const { n } = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM transactions").get()!;
if (n > 0 && !force) {
  console.log(`O banco já tem ${n} transações. Use "bun run seed --force" para apagar tudo e recriar.`);
  process.exit(0);
}

db.transaction(() => {
  if (force) {
    db.run("DELETE FROM budgets");
    db.run("DELETE FROM transactions");
    db.run("DELETE FROM accounts");
  }

  // PRNG determinístico para dados reproduzíveis
  let state = 42;
  const rand = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));

  const cat = Object.fromEntries(listCategories(db).map((c) => [c.name, c.id]));
  const corrente = createAccount(db, { name: "Conta corrente", type: "corrente", initial_balance_cents: 350_000 }).id;
  const poupanca = createAccount(db, { name: "Poupança", type: "poupanca", initial_balance_cents: 1_200_000 }).id;
  const cartao = createAccount(db, { name: "Cartão de crédito", type: "cartao", initial_balance_cents: 0, closing_day: 28, due_day: 8 }).id;
  const invest = createAccount(db, { name: "Tesouro / CDB", type: "investimento", initial_balance_cents: 2_500_000 }).id;

  const now = currentMonth();
  const today = todayISO();
  const add = (t: Record<string, unknown>) => {
    if ((t.date as string) <= today) createTransaction(db, t);
  };
  const day = (month: string, d: number) => `${month}-${String(d).padStart(2, "0")}`;

  for (const month of monthRange(now, 12)) {
    add({ kind: "receita", account_id: corrente, amount_cents: 850_000, date: day(month, 5), category_id: cat["Salário"], description: "Salário" });
    if (rand() < 0.4)
      add({ kind: "receita", account_id: corrente, amount_cents: between(80_000, 250_000), date: day(month, between(10, 25)), category_id: cat["Freelance"], description: "Projeto freelance" });
    add({ kind: "receita", account_id: invest, amount_cents: between(18_000, 26_000), date: day(month, 28), category_id: cat["Rendimentos"], description: "Rendimento CDB" });

    add({ kind: "despesa", account_id: corrente, amount_cents: 280_000, date: day(month, 6), category_id: cat["Moradia"], description: "Aluguel" });
    add({ kind: "despesa", account_id: corrente, amount_cents: 65_000, date: day(month, 6), category_id: cat["Moradia"], description: "Condomínio" });
    add({ kind: "despesa", account_id: corrente, amount_cents: between(18_000, 32_000), date: day(month, 12), category_id: cat["Contas e serviços"], description: "Luz" });
    add({ kind: "despesa", account_id: corrente, amount_cents: 12_990, date: day(month, 15), category_id: cat["Contas e serviços"], description: "Internet" });
    add({ kind: "despesa", account_id: cartao, amount_cents: 5_590, date: day(month, 3), category_id: cat["Lazer"], description: "Streaming" });
    add({ kind: "despesa", account_id: corrente, amount_cents: 45_000, date: day(month, 10), category_id: cat["Educação"], description: "Curso de inglês" });
    add({ kind: "despesa", account_id: corrente, amount_cents: 32_000, date: day(month, 8), category_id: cat["Saúde"], description: "Plano de saúde" });

    for (let i = 0; i < 4; i++)
      add({ kind: "despesa", account_id: cartao, amount_cents: between(25_000, 70_000), date: day(month, 2 + i * 7), category_id: cat["Alimentação"], description: "Supermercado" });
    for (let i = 0; i < between(3, 7); i++)
      add({ kind: "despesa", account_id: cartao, amount_cents: between(3_500, 18_000), date: day(month, between(1, 28)), category_id: cat["Alimentação"], description: "Restaurante" });
    for (let i = 0; i < between(4, 8); i++)
      add({ kind: "despesa", account_id: cartao, amount_cents: between(1_500, 6_000), date: day(month, between(1, 28)), category_id: cat["Transporte"], description: "Uber" });
    add({ kind: "despesa", account_id: cartao, amount_cents: between(20_000, 35_000), date: day(month, between(1, 28)), category_id: cat["Transporte"], description: "Combustível" });
    for (let i = 0; i < between(1, 3); i++)
      add({ kind: "despesa", account_id: cartao, amount_cents: between(5_000, 30_000), date: day(month, between(1, 28)), category_id: cat["Lazer"], description: "Cinema / passeio" });
    if (rand() < 0.5)
      add({ kind: "despesa", account_id: cartao, amount_cents: between(10_000, 90_000), date: day(month, between(1, 28)), category_id: cat["Compras"], description: "Compras online" });
    if (rand() < 0.25)
      add({ kind: "despesa", account_id: corrente, amount_cents: between(15_000, 60_000), date: day(month, between(1, 28)), category_id: cat["Saúde"], description: "Farmácia / consulta" });

    add({ kind: "transferencia", account_id: corrente, to_account_id: invest, amount_cents: 100_000, date: day(month, 20), description: "Aporte mensal" });
  }

  // Paga todas as faturas já vencidas, no dia do vencimento
  for (const inv of listInvoices(db, cartao)) {
    if (inv.due_date <= today && inv.total_cents > 0) {
      payInvoice(db, cartao, inv.month, { account_id: corrente, amount_cents: inv.total_cents, date: inv.due_date });
    }
  }

  const limits: Record<string, number> = {
    Alimentação: 250_000,
    Transporte: 60_000,
    Lazer: 40_000,
    Compras: 50_000,
    "Contas e serviços": 45_000,
    Moradia: 345_000,
  };
  for (const month of [addMonths(now, -1), now])
    for (const [name, limit_cents] of Object.entries(limits)) upsertBudget(db, { category_id: cat[name], month, limit_cents });
})();

const total = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM transactions").get()!.n;
console.log(`Dados de exemplo criados: 4 contas, ${total} transações e orçamentos para os 2 últimos meses.`);
