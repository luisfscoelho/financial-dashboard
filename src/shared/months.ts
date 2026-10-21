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
