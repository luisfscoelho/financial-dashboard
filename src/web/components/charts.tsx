import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CashflowPoint, CategoryTotal, NetWorthPoint } from "../../shared/types";
import { formatBRL, formatBRLCompact, formatMonth, formatMonthShort } from "../lib/format";

const AXIS = { stroke: "var(--axis)", tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false } as const;

function TooltipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{title}</div>
      {children}
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 text-ink-2">
        <span className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="tabular font-medium text-ink">{value}</span>
    </div>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/* ---------- Despesas por categoria (rosca) ---------- */

const MAX_SLICES = 6;

/** Mantém as maiores categorias e agrupa o resto em "Outras" (nunca gera cores novas). */
function foldCategories(rows: CategoryTotal[]) {
  if (rows.length <= MAX_SLICES + 1) return rows;
  const head = rows.slice(0, MAX_SLICES);
  const rest = rows.slice(MAX_SLICES).reduce((s, r) => s + r.total_cents, 0);
  return [...head, { category_id: -1, name: "Outras", color: "var(--muted)", total_cents: rest }];
}

export function CategoryDonut({ rows }: { rows: CategoryTotal[] }) {
  const data = foldCategories(rows);
  const total = data.reduce((s, r) => s + r.total_cents, 0);
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-4 @md:flex-row">
        <div className="relative size-44 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="total_cents"
                nameKey="name"
                innerRadius="64%"
                outerRadius="100%"
                stroke="var(--surface)"
                strokeWidth={2}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as CategoryTotal | undefined;
                  if (!active || !p) return null;
                  return (
                    <TooltipBox title={p.name}>
                      <TooltipRow color={p.color} label={`${Math.round((p.total_cents / total) * 100)}%`} value={formatBRL(p.total_cents)} />
                    </TooltipBox>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-muted">Total</span>
            <span className="text-sm font-semibold">{formatBRLCompact(total)}</span>
          </div>
        </div>
        <ul className="w-full flex-1 text-sm">
          {data.map((d) => (
            <li key={d.name} className="flex items-center justify-between gap-2 py-1">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                <span className="truncate">{d.name}</span>
              </span>
              <span className="tabular shrink-0 text-ink-2">
                {formatBRL(d.total_cents)} <span className="inline-block w-10 text-right text-muted">{Math.round((d.total_cents / total) * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Receitas × despesas por mês ---------- */

const INCOME = { color: "var(--series-1)", label: "Receitas" };
const EXPENSE = { color: "var(--series-2)", label: "Despesas" };

export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  return (
    <>
      <div className="mb-2 flex gap-4">
        <LegendItem {...INCOME} />
        <LegendItem {...EXPENSE} />
      </div>
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart data={data} barGap={2} barCategoryGap="25%" margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="month" tickFormatter={formatMonthShort} {...AXIS} />
            <YAxis tickFormatter={formatBRLCompact} {...AXIS} axisLine={false} width={72} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload, label }) => {
                const p = payload?.[0]?.payload as CashflowPoint | undefined;
                if (!active || !p) return null;
                return (
                  <TooltipBox title={formatMonth(String(label))}>
                    <TooltipRow color={INCOME.color} label={INCOME.label} value={formatBRL(p.income_cents)} />
                    <TooltipRow color={EXPENSE.color} label={EXPENSE.label} value={formatBRL(p.expense_cents)} />
                    <div className="mt-1 border-t border-line pt-1">
                      <TooltipRow color="transparent" label="Saldo" value={formatBRL(p.income_cents - p.expense_cents)} />
                    </div>
                  </TooltipBox>
                );
              }}
            />
            <Bar dataKey="income_cents" name={INCOME.label} fill={INCOME.color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <Bar dataKey="expense_cents" name={EXPENSE.label} fill={EXPENSE.color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ---------- Evolução do patrimônio ---------- */

export function NetWorthChart({ data }: { data: NetWorthPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="month" tickFormatter={formatMonthShort} {...AXIS} />
          <YAxis tickFormatter={formatBRLCompact} {...AXIS} axisLine={false} width={72} domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={({ active, payload, label }) => {
              const p = payload?.[0]?.payload as NetWorthPoint | undefined;
              if (!active || !p) return null;
              return (
                <TooltipBox title={formatMonth(String(label))}>
                  <TooltipRow color="var(--series-1)" label="Patrimônio" value={formatBRL(p.net_worth_cents)} />
                </TooltipBox>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="net_worth_cents"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="var(--series-1)"
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2, fill: "var(--series-1)" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Tabela alternativa (acessibilidade) ---------- */

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            {head.map((h, i) => (
              <th key={h} className={`py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-b border-line last:border-0">
              {r.map((c, i) => (
                <td key={i} className={`py-1.5 ${i === 0 ? "text-left" : "tabular text-right"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
