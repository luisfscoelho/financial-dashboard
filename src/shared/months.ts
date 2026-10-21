/** Utilitários de mês no formato YYYY-MM (sem fuso horário envolvido). */

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Últimos `count` meses terminando em `end` (inclusive), do mais antigo ao mais recente. */
export function monthRange(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1));
}

/** Limites [primeiro dia, último dia possível] para comparação de strings de data. */
export function monthBounds(month: string): [string, string] {
  return [`${month}-01`, `${month}-31`];
}

/** Soma meses a uma data YYYY-MM-DD, ajustando o dia ao fim do mês (31/01 + 1 mês = 28/02). */
export function addMonthsToDate(isoDate: string, delta: number): string {
  const month = addMonths(isoDate.slice(0, 7), delta);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Number(isoDate.slice(8, 10)), lastDay);
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Data local de hoje em YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Divide um total em `count` parcelas inteiras; os centavos que sobram ficam na primeira. */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const rest = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + rest : base));
}
