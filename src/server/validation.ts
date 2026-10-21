export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (what: string) => new HttpError(404, `${what} não encontrado(a)`);

type Body = Record<string, unknown>;

export function asBody(value: unknown): Body {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("Corpo da requisição inválido");
  }
  return value as Body;
}

export function str(body: Body, key: string, label: string, opts: { optional?: boolean } = {}): string {
  const v = body[key];
  if (v === undefined || v === null || v === "") {
    if (opts.optional) return "";
    throw badRequest(`${label} é obrigatório`);
  }
  if (typeof v !== "string") throw badRequest(`${label} inválido`);
  return v.trim();
}

export function int(body: Body, key: string, label: string, opts: { optional?: boolean; min?: number } = {}) {
  const v = body[key];
  if (v === undefined || v === null || v === "") {
    if (opts.optional) return null;
    throw badRequest(`${label} é obrigatório`);
  }
  if (typeof v !== "number" || !Number.isInteger(v)) throw badRequest(`${label} inválido`);
  if (opts.min !== undefined && v < opts.min) throw badRequest(`${label} deve ser no mínimo ${opts.min}`);
  return v;
}

export function oneOf<T extends string>(body: Body, key: string, label: string, values: readonly T[]): T {
  const v = body[key];
  if (typeof v !== "string" || !values.includes(v as T)) throw badRequest(`${label} inválido`);
  return v as T;
}

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function date(body: Body, key: string, label: string): string {
  const v = str(body, key, label);
  if (!DATE_RE.test(v)) throw badRequest(`${label} inválida (use AAAA-MM-DD)`);
  return v;
}

export function assertMonth(v: string | null | undefined, label = "Mês"): string {
  if (!v || !MONTH_RE.test(v)) throw badRequest(`${label} inválido (use AAAA-MM)`);
  return v;
}

export function color(body: Body, key: string): string {
  const v = str(body, key, "Cor");
  if (!COLOR_RE.test(v)) throw badRequest("Cor inválida (use #RRGGBB)");
  return v.toLowerCase();
}
