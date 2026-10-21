const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShortFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

/** 123456 -> "R$ 1.234,56" */
export const formatBRL = (cents: number) => brl.format(cents / 100);

/** 123456789 -> "R$ 1,2 mi" (eixos de gráfico) */
export const formatBRLCompact = (cents: number) => brlCompact.format(cents / 100);

/** Centavos -> texto editável: 123456 -> "1.234,56" */
export const centsToInput = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Texto digitado -> centavos. Aceita "1.234,56", "1234,5", "1234" e "-50".
 * Retorna null se não for um número válido.
 */
export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** "2026-10-21" -> "21/10/2026" (sem passar por Date, evitando problemas de fuso) */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-10" -> "Outubro de 2026" */
export function formatMonth(month: string) {
  const s = monthFmt.format(new Date(`${month}-01T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "2026-10" -> "out" */
export const formatMonthShort = (month: string) =>
  monthShortFmt.format(new Date(`${month}-01T00:00:00Z`)).replace(".", "");
