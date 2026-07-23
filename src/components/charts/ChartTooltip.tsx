'use client';

// Tooltip partilhado pelos gráficos: cartão on-brand (bg-card + border-border),
// texto em tokens de tinta (nunca na cor da série — a série é o ponto colorido),
// valores em euros. Serve gráficos de 1 ou N séries: itera o payload.

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

type TooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
};

export function ChartTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-[var(--shadow-card)]">
      {label && <p className="mb-1.5 text-xs font-bold text-ink">{label}</p>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <p
            key={`${p.dataKey ?? i}`}
            className="flex items-center gap-2 text-xs text-ink-soft"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{background: p.color}}
            />
            <span>{p.name}</span>
            <span className="ml-auto pl-4 font-bold text-ink tabular-nums">
              {typeof p.value === 'number' ? eur(p.value) : p.value}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
