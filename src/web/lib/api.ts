import { useCallback, useEffect, useState } from "react";
import type {
  AccountWithBalance,
  BudgetRow,
  CashflowPoint,
  Category,
  CategoryTotal,
  MonthSummary,
  NetWorthPoint,
  TransactionFilters,
  TransactionView,
} from "../../shared/types";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  accounts: (includeArchived = false) =>
    request<AccountWithBalance[]>("GET", `/accounts${includeArchived ? "?archived=1" : ""}`),
  createAccount: (a: unknown) => request("POST", "/accounts", a),
  updateAccount: (id: number, a: unknown) => request("PUT", `/accounts/${id}`, a),
  deleteAccount: (id: number) => request("DELETE", `/accounts/${id}`),

  categories: () => request<Category[]>("GET", "/categories"),
  createCategory: (c: unknown) => request("POST", "/categories", c),
  updateCategory: (id: number, c: unknown) => request("PUT", `/categories/${id}`, c),
  deleteCategory: (id: number) => request("DELETE", `/categories/${id}`),

  transactions: (f: TransactionFilters = {}) => request<TransactionView[]>("GET", `/transactions${qs({ ...f })}`),
  createTransaction: (t: unknown) => request("POST", "/transactions", t),
  updateTransaction: (id: number, t: unknown) => request("PUT", `/transactions/${id}`, t),
  deleteTransaction: (id: number) => request("DELETE", `/transactions/${id}`),
  deleteInstallmentPlan: (id: number) => request("DELETE", `/installment-plans/${id}`),

  budgets: (month: string) => request<BudgetRow[]>("GET", `/budgets${qs({ month })}`),
  setBudget: (b: { category_id: number; month: string; limit_cents: number }) => request("PUT", "/budgets", b),
  deleteBudget: (id: number) => request("DELETE", `/budgets/${id}`),
  copyBudgets: (month: string) => request<{ copied: number }>("POST", `/budgets/copy-previous${qs({ month })}`),

  summary: (month: string) => request<MonthSummary>("GET", `/reports/summary${qs({ month })}`),
  byCategory: (month: string, kind: "receita" | "despesa" = "despesa") =>
    request<CategoryTotal[]>("GET", `/reports/by-category${qs({ month, kind })}`),
  cashflow: (month: string, months = 12) => request<CashflowPoint[]>("GET", `/reports/cashflow${qs({ month, months })}`),
  netWorth: (month: string, months = 12) => request<NetWorthPoint[]>("GET", `/reports/net-worth${qs({ month, months })}`),
};

/** Carrega dados e recarrega quando `deps` mudam; `reload()` força nova busca. */
export function useData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, reload };
}
