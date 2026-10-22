import type { Subscription } from "./types";

/** Custo anual das assinaturas ativas: mensais × 12 + anuais. */
export function annualCost(subs: Pick<Subscription, "amount_cents" | "period" | "active">[]) {
  return subs.filter((s) => s.active).reduce((sum, s) => sum + (s.period === "mensal" ? s.amount_cents * 12 : s.amount_cents), 0);
}

/** Assinaturas anuais ativas que renovam no mês (YYYY-MM). */
export function renewingIn<T extends Pick<Subscription, "period" | "renewal_month" | "active">>(subs: T[], month: string) {
  const m = Number(month.slice(5, 7));
  return subs.filter((s) => s.active && s.period === "anual" && s.renewal_month === m);
}
