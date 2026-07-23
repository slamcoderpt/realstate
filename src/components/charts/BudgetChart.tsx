'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {useTranslations} from 'next-intl';
import {ChartTooltip} from './ChartTooltip';

export type BudgetChartRow = {name: string; budget: number; actual: number};

// Formata montantes no eixo Y de forma compacta (€12k) — a régua não é para
// ler o cêntimo, é para dar escala; o valor exato vive no tooltip.
function eurAxis(v: number): string {
  if (Math.abs(v) >= 1000) return `€${Math.round(v / 1000)}k`;
  return `€${v}`;
}

/**
 * Orçamento vs. executado por rubrica (2 séries). Cores validadas com o dataviz
 * em ambos os modos: laranja p/ orçamento, azul da marca p/ executado. Legenda
 * presente (2 séries); texto em tokens de tinta.
 */
export function BudgetChart({data}: {data: BudgetChartRow[]}) {
  const t = useTranslations('Works');
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{top: 8, right: 8, bottom: 0, left: 0}}
          barGap={2}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{fontSize: 12, fill: 'var(--color-ink-muted)'}}
            tickLine={false}
            axisLine={{stroke: 'var(--color-border)'}}
            interval={0}
          />
          <YAxis
            tickFormatter={eurAxis}
            tick={{fontSize: 12, fill: 'var(--color-ink-muted)'}}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{fill: 'var(--color-brand-50)'}}
          />
          <Legend
            formatter={(value) => (
              <span className="text-xs font-semibold text-ink-soft">{value}</span>
            )}
          />
          <Bar
            dataKey="budget"
            name={t('budget')}
            fill="var(--chart-budget)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          <Bar
            dataKey="actual"
            name={t('spent')}
            fill="var(--chart-actual)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
