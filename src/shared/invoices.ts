/**
 * Regras de fatura do cartão. Uma fatura é identificada pelo mês de VENCIMENTO (YYYY-MM):
 * a "fatura de novembro" vence em novembro. Se o vencimento é depois do fechamento no mês
 * (fecha 3, vence 10), a fatura fecha no mesmo mês; senão (fecha 28, vence 8), fecha no mês anterior.
 * Compras com data anterior ao fechamento entram na fatura; no dia do fechamento ou depois, na seguinte.
 */
import { addMonths, dayInMonth } from "./months";

export interface CardCycle {
  closing_day: number;
  due_day: number;
}

export function closingDate(invoiceMonth: string, c: CardCycle): string {
  const closingMonth = c.due_day > c.closing_day ? invoiceMonth : addMonths(invoiceMonth, -1);
  return dayInMonth(closingMonth, c.closing_day);
}

export function dueDate(invoiceMonth: string, c: CardCycle): string {
  return dayInMonth(invoiceMonth, c.due_day);
}

/** Fatura (mês de vencimento) em que entra uma compra feita em `date`. */
export function invoiceMonthFor(date: string, c: CardCycle): string {
  let month = addMonths(date.slice(0, 7), -1);
  while (closingDate(month, c) <= date) month = addMonths(month, 1);
  return month;
}

export type InvoiceStatus = "futura" | "aberta" | "fechada" | "vencida" | "paga";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  futura: "Futura",
  aberta: "Aberta",
  fechada: "Fechada",
  vencida: "Vencida",
  paga: "Paga",
};

export function invoiceStatus(invoiceMonth: string, c: CardCycle, totalCents: number, paidCents: number, today: string): InvoiceStatus {
  if (paidCents >= totalCents && (paidCents > 0 || closingDate(invoiceMonth, c) <= today)) return "paga";
  if (today < closingDate(invoiceMonth, c)) return invoiceMonth === invoiceMonthFor(today, c) ? "aberta" : "futura";
  return today > dueDate(invoiceMonth, c) ? "vencida" : "fechada";
}
