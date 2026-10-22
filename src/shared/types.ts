import type { InvoiceStatus } from "./invoices";

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
  closing_day: number | null; // só cartão: dia de fechamento da fatura
  due_day: number | null; // só cartão: dia de vencimento da fatura
}

export interface AccountWithBalance extends Account {
  balance_cents: number; // saldo até hoje
  future_cents: number; // lançamentos com data futura (ex.: parcelas a vencer), com sinal
}

export const CATEGORY_BUCKETS = ["fixo", "livre"] as const;
export type CategoryBucket = (typeof CATEGORY_BUCKETS)[number];

export interface Category {
  id: number;
  name: string;
  kind: CategoryKind;
  color: string;
  bucket: CategoryBucket | null; // só despesa: grupo no Ideal (gastos fixos ou livres)
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
  invoice_month: string | null; // fatura (mês de vencimento) em que a compra no cartão entra
  invoice_payment_for: string | null; // em pagamentos de fatura: qual fatura quita
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
  invoice?: string; // YYYY-MM: só lançamentos desta fatura (use com `account`)
  limit?: number;
}

export interface Invoice {
  month: string; // mês de vencimento
  closing_date: string;
  due_date: string;
  total_cents: number; // compras − estornos
  paid_cents: number;
  status: InvoiceStatus;
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

export interface Goal {
  id: number;
  name: string;
  target_cents: number;
  account_id: number;
  target_month: string | null; // YYYY-MM
}

export interface GoalView extends Goal {
  account_name: string;
  current_cents: number; // saldo atual da conta vinculada
}

export const IDEAL_BUCKETS = ["fixo", "livre", "investimento"] as const;
export type IdealBucket = (typeof IDEAL_BUCKETS)[number];

export const IDEAL_BUCKET_LABELS: Record<IdealBucket, string> = {
  fixo: "Gastos fixos",
  livre: "Livre",
  investimento: "Investimento",
};

export interface IdealRow {
  bucket: IdealBucket;
  pct: number; // % ideal da renda
  target_cents: number; // renda do mês × pct
  actual_cents: number;
}

export interface IdealReport {
  month: string;
  income_cents: number;
  rows: IdealRow[];
}

export type SubscriptionPeriod = "mensal" | "anual";

export interface Subscription {
  id: number;
  name: string;
  amount_cents: number;
  period: SubscriptionPeriod;
  renewal_month: number | null; // 1–12, só anual
  account_id: number | null;
  category_id: number | null;
  active: 0 | 1;
}

export interface SubscriptionView extends Subscription {
  account_name: string | null;
  category_name: string | null;
  category_color: string | null;
}
