import type { Database } from "bun:sqlite";
import { currentMonth } from "../shared/months";
import type { TransactionFilters, TransactionKind } from "../shared/types";
import * as accounts from "./repos/accounts";
import * as budgets from "./repos/budgets";
import * as categories from "./repos/categories";
import * as reports from "./repos/reports";
import * as transactions from "./repos/transactions";
import { assertMonth, badRequest, HttpError } from "./validation";

type Req = Bun.BunRequest<string> & { params: Record<string, string> };
type Handler = (req: Req, url: URL) => unknown | Promise<unknown>;

const id = (req: Req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw badRequest("ID inválido");
  return n;
};
const optInt = (v: string | null) => (v ? Number(v) || undefined : undefined);
const monthParam = (url: URL) => assertMonth(url.searchParams.get("month") ?? currentMonth());
const monthsParam = (url: URL) => Math.min(Math.max(Number(url.searchParams.get("months")) || 12, 1), 60);

function wrap(handler: Handler) {
  return async (req: Req) => {
    try {
      const result = await handler(req, new URL(req.url));
      if (result === undefined) return new Response(null, { status: 204 });
      return Response.json(result, { status: req.method === "POST" ? 201 : 200 });
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof SyntaxError) return Response.json({ error: "JSON inválido" }, { status: 400 });
      console.error(e);
      return Response.json({ error: "Erro interno do servidor" }, { status: 500 });
    }
  };
}

/** Rotas da API no formato aceito por `Bun.serve({ routes })`. */
export function apiRoutes(db: Database) {
  const routes = {
    "/api/accounts": {
      GET: (_r, url) => accounts.listAccounts(db, { includeArchived: url.searchParams.get("archived") === "1" }),
      POST: async (r) => accounts.createAccount(db, await r.json()),
    },
    "/api/accounts/:id": {
      PUT: async (r) => accounts.updateAccount(db, id(r), await r.json()),
      DELETE: (r) => accounts.deleteAccount(db, id(r)),
    },
    "/api/categories": {
      GET: () => categories.listCategories(db),
      POST: async (r) => categories.createCategory(db, await r.json()),
    },
    "/api/categories/:id": {
      PUT: async (r) => categories.updateCategory(db, id(r), await r.json()),
      DELETE: (r) => categories.deleteCategory(db, id(r)),
    },
    "/api/transactions": {
      GET: (_r, url) => {
        const p = url.searchParams;
        const f: TransactionFilters = {
          month: p.get("month") ? assertMonth(p.get("month")) : undefined,
          account: optInt(p.get("account")),
          category: optInt(p.get("category")),
          kind: (p.get("kind") as TransactionKind) || undefined,
          q: p.get("q") || undefined,
          limit: optInt(p.get("limit")),
        };
        return transactions.listTransactions(db, f);
      },
      POST: async (r) => transactions.createTransaction(db, await r.json()),
    },
    "/api/transactions/:id": {
      PUT: async (r) => transactions.updateTransaction(db, id(r), await r.json()),
      DELETE: (r) => transactions.deleteTransaction(db, id(r)),
    },
    "/api/budgets": {
      GET: (_r, url) => budgets.listBudgets(db, monthParam(url)),
      PUT: async (r) => budgets.upsertBudget(db, await r.json()),
    },
    "/api/budgets/copy-previous": {
      POST: (_r, url) => ({ copied: budgets.copyPreviousMonth(db, monthParam(url)) }),
    },
    "/api/budgets/:id": {
      DELETE: (r) => budgets.deleteBudget(db, id(r)),
    },
    "/api/reports/summary": { GET: (_r, url) => reports.monthSummary(db, monthParam(url)) },
    "/api/reports/by-category": {
      GET: (_r, url) =>
        reports.byCategory(db, monthParam(url), url.searchParams.get("kind") === "receita" ? "receita" : "despesa"),
    },
    "/api/reports/cashflow": { GET: (_r, url) => reports.cashflow(db, monthParam(url), monthsParam(url)) },
    "/api/reports/net-worth": { GET: (_r, url) => reports.netWorthSeries(db, monthParam(url), monthsParam(url)) },
  } satisfies Record<string, Record<string, Handler>>;

  return Object.fromEntries(
    Object.entries(routes).map(([path, methods]) => [
      path,
      Object.fromEntries(Object.entries(methods).map(([m, h]) => [m, wrap(h as Handler)])),
    ]),
  );
}
