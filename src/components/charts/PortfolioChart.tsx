'use client';

import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {useTranslations} from 'next-intl';
import {ChartTooltip} from './ChartTooltip';

export type PortfolioChartRow = {name: string; amount: number};

function eurAxis(v: number): string {
  if (Math.abs(v) >= 1000) return `€${Math.round(v / 1000)}k`;
  return `€${v}`;
}

/**
 * Distribuição da carteira: capital investido por projeto (série única, barras
 * horizontais). Uma só cor (azul da marca) — sem legenda, o título nomeia a
 * série. Rótulo de valor no topo de cada barra (poucas barras, leitura direta).
 */
export function PortfolioChart({data}: {data: PortfolioChartRow[]}) {
  const t = useTranslations('Dashboard');
  // Altura proporcional ao nº de projetos: barras horizontais precisam de
  // espaço vertical por linha, senão colam-se umas às outras.
  const height = Math.max(160, data.length * 56 + 24);
  return (
    <div className="w-full" style={{height}}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{top: 4, right: 56, bottom: 4, left: 8}}
        >
          <XAxis type="number" tickFormatter={eurAxis} hide />
          <YAxis
            type="category"
            dataKey="name"
            tick={{fontSize: 12, fill: 'var(--color-ink)'}}
            tickLine={false}
            axisLine={false}
            width={140}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{fill: 'var(--color-brand-50)'}}
          />
          <Bar
            dataKey="amount"
            name={t('invested')}
            fill="var(--chart-actual)"
            radius={[4, 4, 4, 4]}
            maxBarSize={28}
          >
            <LabelList
              dataKey="amount"
              position="right"
              formatter={(v: number) => eurAxis(v)}
              className="fill-ink-soft text-xs font-bold"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
