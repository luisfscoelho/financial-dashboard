export const ACCOUNT_TYPES = ["corrente", "poupanca", "cartao", "investimento", "dinheiro"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  cartao: "Cartão de crédito",
  investimento: "Investimentos",
  dinheiro: "Dinheiro",
};

export type CategoryKind = "receita" | "despesa";
export type TransactionKind = CategoryKind | "transferencia";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  initial_balance_cents: number;
  archived: 0 | 1;
  created_at: string;
}

export interface AccountWithBalance extends Account {
  balance_cents: number; // saldo até hoje
  future_cents: number; // lançamentos com data futura (ex.: parcelas a vencer), com sinal
}

export interface Category {
  id: number;
  name: string;
  kind: CategoryKind;
  color: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  category_id: number | null;
  kind: TransactionKind;
  amount_cents: number;
  date: string; // YYYY-MM-DD
  description: string;
  to_account_id: number | null;
  installment_plan_id: number | null;
  installment_number: number | null;
}

export interface TransactionView extends Transaction {
  account_name: string;
  account_type: AccountType;
  to_account_name: string | null;
  category_name: string | null;
  category_color: string | null;
  installment_total: number | null; // número de parcelas do plano
  installment_plan_total_cents: number | null; // valor total da compra parcelada
}

export const MAX_INSTALLMENTS = 48;

export interface TransactionFilters {
  month?: string; // YYYY-MM
  account?: number;
  category?: number;
  kind?: TransactionKind;
  q?: string;
  limit?: number;
}

export interface BudgetRow {
  id: number | null; // null = sem orçamento definido
  category_id: number;
  category_name: string;
  category_color: string;
  month: string;
  limit_cents: number | null;
  spent_cents: number;
}

export interface MonthSummary {
  month: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
  net_worth_cents: number;
}

export interface CategoryTotal {
  category_id: number | null;
  name: string;
  color: string;
  total_cents: number;
}

export interface CashflowPoint {
  month: string;
  income_cents: number;
  expense_cents: number;
}

export interface NetWorthPoint {
  month: string;
  net_worth_cents: number;
}
