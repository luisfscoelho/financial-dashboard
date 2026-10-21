import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { openDb } from "../src/server/db";
import * as accounts from "../src/server/repos/accounts";
import * as budgets from "../src/server/repos/budgets";
import * as categories from "../src/server/repos/categories";
import * as reports from "../src/server/repos/reports";
import * as tx from "../src/server/repos/transactions";
import { HttpError } from "../src/server/validation";
import { addMonths, addMonthsToDate, monthRange, splitInstallments } from "../src/shared/months";

let db: Database;
let corrente: number;
let poupanca: number;
let cartao: number;
const cat = (name: string) => categories.listCategories(db).find((c) => c.name === name)!.id;
const balances = () => Object.fromEntries(accounts.listAccounts(db).map((a) => [a.id, a.balance_cents]));

beforeEach(() => {
  db = openDb(":memory:");
  corrente = accounts.createAccount(db, { name: "Nubank", type: "corrente", initial_balance_cents: 100_000 }).id;
  poupanca = accounts.createAccount(db, { name: "Poupança", type: "poupanca", initial_balance_cents: 50_000 }).id;
  cartao = accounts.createAccount(db, { name: "Cartão", type: "cartao" }).id;
});

describe("schema", () => {
  test("cria categorias padrão", () => {
    const cats = categories.listCategories(db);
    expect(cats.some((c) => c.name === "Salário" && c.kind === "receita")).toBe(true);
    expect(cats.some((c) => c.name === "Alimentação" && c.kind === "despesa")).toBe(true);
  });
});

describe("saldos", () => {
  test("receitas, despesas e transferências afetam o saldo corretamente", () => {
    tx.createTransaction(db, { kind: "receita", account_id: corrente, amount_cents: 500_000, date: "2026-09-05", category_id: cat("Salário") });
    tx.createTransaction(db, { kind: "despesa", account_id: corrente, amount_cents: 120_000, date: "2026-09-10", category_id: cat("Moradia") });
    tx.createTransaction(db, { kind: "transferencia", account_id: corrente, to_account_id: poupanca, amount_cents: 80_000, date: "2026-09-15" });
    tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 30_000, date: "2026-09-20", category_id: cat("Lazer") });

    const b = balances();
    expect(b[corrente]).toBe(100_000 + 500_000 - 120_000 - 80_000);
    expect(b[poupanca]).toBe(50_000 + 80_000);
    expect(b[cartao]).toBe(-30_000);
  });

  test("saldo em uma data ignora lançamentos posteriores", () => {
    tx.createTransaction(db, { kind: "despesa", account_id: corrente, amount_cents: 10_000, date: "2026-10-01" });
    const atSept = accounts.listAccounts(db, { asOf: "2026-09-30" }).find((a) => a.id === corrente)!;
    expect(atSept.balance_cents).toBe(100_000);
  });

  test("não exclui conta com transações", () => {
    tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 1, date: "2026-10-01" });
    expect(() => accounts.deleteAccount(db, cartao)).toThrow(HttpError);
    accounts.deleteAccount(db, poupanca);
    expect(accounts.listAccounts(db).map((a) => a.id)).not.toContain(poupanca);
  });
});

describe("validação de transações", () => {
  test("rejeita categoria de tipo diferente", () => {
    expect(() =>
      tx.createTransaction(db, { kind: "despesa", account_id: corrente, amount_cents: 100, date: "2026-10-01", category_id: cat("Salário") }),
    ).toThrow(/não é de despesa/);
  });

  test("rejeita transferência para a mesma conta e valor inválido", () => {
    expect(() =>
      tx.createTransaction(db, { kind: "transferencia", account_id: corrente, to_account_id: corrente, amount_cents: 100, date: "2026-10-01" }),
    ).toThrow(HttpError);
    expect(() => tx.createTransaction(db, { kind: "despesa", account_id: corrente, amount_cents: 0, date: "2026-10-01" })).toThrow(HttpError);
    expect(() => tx.createTransaction(db, { kind: "despesa", account_id: corrente, amount_cents: 10, date: "01/10/2026" })).toThrow(HttpError);
  });

  test("filtra por mês, conta e texto", () => {
    tx.createTransaction(db, { kind: "despesa", account_id: corrente, amount_cents: 100, date: "2026-09-30", description: "Mercado" });
    tx.createTransaction(db, { kind: "despesa", account_id: corrente, amount_cents: 200, date: "2026-10-01", description: "Padaria" });
    tx.createTransaction(db, { kind: "transferencia", account_id: corrente, to_account_id: poupanca, amount_cents: 300, date: "2026-10-02" });
    expect(tx.listTransactions(db, { month: "2026-10" })).toHaveLength(2);
    expect(tx.listTransactions(db, { account: poupanca })).toHaveLength(1);
    expect(tx.listTransactions(db, { q: "merc" })[0]!.description).toBe("Mercado");
  });

  test("excluir categoria deixa transações sem categoria", () => {
    const t = tx.createTransaction(db, { kind: "despesa", account_id: corrente, amount_cents: 100, date: "2026-10-01", category_id: cat("Lazer") });
    categories.deleteCategory(db, cat("Lazer"));
    expect(tx.getTransaction(db, t.id).category_id).toBeNull();
  });
});

describe("compras parceladas", () => {
  test("cria uma parcela por mês, com os centavos restantes na primeira", () => {
    const first = tx.createTransaction(db, {
      kind: "despesa", account_id: cartao, amount_cents: 100_000, date: "2026-01-31",
      category_id: cat("Compras"), description: "Notebook", installments: 3,
    });
    expect(first.installment_number).toBe(1);
    expect(first.installment_total).toBe(3);
    expect(first.installment_plan_total_cents).toBe(100_000);

    const rows = tx.listTransactions(db, { q: "Notebook" }).reverse();
    expect(rows.map((r) => [r.date, r.amount_cents, r.installment_number])).toEqual([
      ["2026-01-31", 33_334, 1],
      ["2026-02-28", 33_333, 2],
      ["2026-03-31", 33_333, 3],
    ]);
    expect(new Set(rows.map((r) => r.installment_plan_id)).size).toBe(1);
  });

  test("cada parcela conta no orçamento do seu mês", () => {
    tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 60_000, date: "2026-09-10", category_id: cat("Compras"), installments: 6 });
    for (const month of ["2026-09", "2026-10", "2027-02"]) {
      expect(budgets.listBudgets(db, month).find((b) => b.category_id === cat("Compras"))!.spent_cents).toBe(10_000);
    }
    expect(budgets.listBudgets(db, "2027-03").find((b) => b.category_id === cat("Compras"))!.spent_cents).toBe(0);
  });

  test("saldo do cartão separa parcelas já lançadas das futuras", () => {
    tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 30_000, date: "2026-09-10", installments: 3 });
    const card = accounts.listAccounts(db, { asOf: "2026-09-30" }).find((a) => a.id === cartao)!;
    expect(card.balance_cents).toBe(-10_000);
    expect(card.future_cents).toBe(-20_000);
  });

  test("só permite parcelar despesas no cartão", () => {
    const base = { amount_cents: 10_000, date: "2026-10-01", installments: 2 };
    expect(() => tx.createTransaction(db, { ...base, kind: "despesa", account_id: corrente })).toThrow(/cartão/);
    expect(() => tx.createTransaction(db, { ...base, kind: "receita", account_id: cartao })).toThrow(/cartão/);
    expect(() => tx.createTransaction(db, { ...base, kind: "despesa", account_id: cartao, installments: 49 })).toThrow(HttpError);
    expect(() => tx.createTransaction(db, { ...base, kind: "despesa", account_id: cartao, amount_cents: 1 })).toThrow(HttpError);
  });

  test("editar uma parcela não afeta as outras e não pode virar outro tipo", () => {
    const first = tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 20_000, date: "2026-10-05", description: "TV", installments: 2 });
    tx.updateTransaction(db, first.id, { kind: "despesa", account_id: cartao, amount_cents: 12_000, date: "2026-10-05", description: "TV" });
    expect(tx.listTransactions(db, { q: "TV" }).map((r) => r.amount_cents).sort()).toEqual([10_000, 12_000]);
    expect(() => tx.updateTransaction(db, first.id, { kind: "despesa", account_id: corrente, amount_cents: 1, date: "2026-10-05" })).toThrow(/cartão/);
  });

  test("excluir o plano remove todas as parcelas; excluir a última parcela remove o plano", () => {
    const a = tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 30_000, date: "2026-10-05", installments: 3 });
    tx.deleteInstallmentPlan(db, a.installment_plan_id!);
    expect(tx.listTransactions(db)).toHaveLength(0);

    const b = tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 20_000, date: "2026-10-05", installments: 2 });
    for (const r of tx.listTransactions(db)) tx.deleteTransaction(db, r.id);
    expect(() => tx.deleteInstallmentPlan(db, b.installment_plan_id!)).toThrow(HttpError);
  });
});

describe("orçamentos", () => {
  test("calcula gasto do mês vs limite e copia do mês anterior", () => {
    const alim = cat("Alimentação");
    budgets.upsertBudget(db, { category_id: alim, month: "2026-09", limit_cents: 100_000 });
    tx.createTransaction(db, { kind: "despesa", account_id: corrente, amount_cents: 40_000, date: "2026-09-03", category_id: alim });
    tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 25_000, date: "2026-09-28", category_id: alim });
    tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 99_999, date: "2026-10-01", category_id: alim });

    const row = budgets.listBudgets(db, "2026-09").find((b) => b.category_id === alim)!;
    expect(row.limit_cents).toBe(100_000);
    expect(row.spent_cents).toBe(65_000);

    // upsert atualiza em vez de duplicar
    budgets.upsertBudget(db, { category_id: alim, month: "2026-09", limit_cents: 120_000 });
    expect(budgets.listBudgets(db, "2026-09").filter((b) => b.limit_cents !== null)).toHaveLength(1);

    expect(budgets.copyPreviousMonth(db, "2026-10")).toBe(1);
    const oct = budgets.listBudgets(db, "2026-10").find((b) => b.category_id === alim)!;
    expect(oct.limit_cents).toBe(120_000);
    expect(oct.spent_cents).toBe(99_999);
  });

  test("não aceita orçamento para categoria de receita", () => {
    expect(() => budgets.upsertBudget(db, { category_id: cat("Salário"), month: "2026-10", limit_cents: 1 })).toThrow(HttpError);
  });
});

describe("relatórios", () => {
  beforeEach(() => {
    tx.createTransaction(db, { kind: "receita", account_id: corrente, amount_cents: 500_000, date: "2026-08-05", category_id: cat("Salário") });
    tx.createTransaction(db, { kind: "despesa", account_id: corrente, amount_cents: 200_000, date: "2026-08-10", category_id: cat("Moradia") });
    tx.createTransaction(db, { kind: "receita", account_id: corrente, amount_cents: 500_000, date: "2026-10-05", category_id: cat("Salário") });
    tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 30_000, date: "2026-10-12", category_id: cat("Lazer") });
    tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 70_000, date: "2026-10-13", category_id: cat("Moradia") });
    tx.createTransaction(db, { kind: "despesa", account_id: cartao, amount_cents: 5_000, date: "2026-10-14" });
    tx.createTransaction(db, { kind: "transferencia", account_id: corrente, to_account_id: poupanca, amount_cents: 100_000, date: "2026-10-20" });
  });

  test("resumo do mês ignora transferências", () => {
    const s = reports.monthSummary(db, "2026-10");
    expect(s.income_cents).toBe(500_000);
    expect(s.expense_cents).toBe(105_000);
    expect(s.net_cents).toBe(395_000);
    expect(s.net_worth_cents).toBe(150_000 + 300_000 + 395_000);
    expect(s.net_worth_cents).toBe(Object.values(balances()).reduce((a, b) => a + b, 0));
  });

  test("gastos por categoria ordenados, com 'Sem categoria'", () => {
    const rows = reports.byCategory(db, "2026-10", "despesa");
    expect(rows.map((r) => [r.name, r.total_cents])).toEqual([
      ["Moradia", 70_000],
      ["Lazer", 30_000],
      ["Sem categoria", 5_000],
    ]);
  });

  test("fluxo de caixa preenche meses vazios", () => {
    const cf = reports.cashflow(db, "2026-10", 3);
    expect(cf).toEqual([
      { month: "2026-08", income_cents: 500_000, expense_cents: 200_000 },
      { month: "2026-09", income_cents: 0, expense_cents: 0 },
      { month: "2026-10", income_cents: 500_000, expense_cents: 105_000 },
    ]);
  });

  test("evolução do patrimônio acumula a partir dos saldos iniciais", () => {
    const nw = reports.netWorthSeries(db, "2026-10", 4);
    expect(nw.map((p) => p.net_worth_cents)).toEqual([150_000, 450_000, 450_000, 845_000]);
    expect(nw.at(-1)!.net_worth_cents).toBe(reports.monthSummary(db, "2026-10").net_worth_cents);
  });
});

describe("meses", () => {
  test("addMonths e monthRange cruzam a virada do ano", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(monthRange("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  test("addMonthsToDate ajusta o dia ao fim do mês", () => {
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDate("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsToDate("2026-11-15", 2)).toBe("2027-01-15");
  });

  test("splitInstallments soma exatamente o total", () => {
    expect(splitInstallments(1000, 3)).toEqual([334, 333, 333]);
    expect(splitInstallments(999, 3)).toEqual([333, 333, 333]);
  });
});
