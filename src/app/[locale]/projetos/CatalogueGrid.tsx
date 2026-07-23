'use client';

import {useMemo, useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {ImageIcon, MapPinIcon} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';

// Estado do projeto tal como chega do catálogo. Definido localmente para não
// importar de um módulo `server-only`. Inclui `preparacao` para casar com o
// tipo do serviço, mas o catálogo nunca o devolve (é filtrado no servidor).
type Status =
  | 'preparacao'
  | 'subscricao'
  | 'subscrito'
  | 'em_curso'
  | 'concluido'
  | 'liquidado';

export type CatalogueCard = {
  id: string;
  name: string;
  location: string;
  status: Status;
  total_amount: number;
  subscribed_amount: number;
  investor_count: number;
  estimated_irr: number;
  term_months: number;
  cover_path: string | null;
};

type Filter = 'all' | 'subscription' | 'ongoing' | 'closed';

// Agrupa os cinco estados lançados nos três baldes do filtro.
function bucketOf(status: Status): Exclude<Filter, 'all'> {
  if (status === 'subscricao') return 'subscription';
  if (status === 'concluido' || status === 'liquidado') return 'closed';
  return 'ongoing'; // subscrito | em_curso
}

// Ordem de leitura: primeiro o que se pode subscrever, depois em curso, por fim
// os fechados. Dentro de cada balde mantém-se a ordem recebida (mais recentes).
const BUCKET_RANK: Record<Exclude<Filter, 'all'>, number> = {
  subscription: 0,
  ongoing: 1,
  closed: 2
};

// A cor do badge reforça a hierarquia: o que está em subscrição salta (marca),
// em curso é neutro, fechado é discreto.
const BADGE_VARIANT: Record<Status, 'default' | 'secondary' | 'outline'> = {
  preparacao: 'outline', // nunca chega ao catálogo; presente só p/ o tipo fechar
  subscricao: 'default',
  subscrito: 'secondary',
  em_curso: 'secondary',
  concluido: 'outline',
  liquidado: 'outline'
};

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

function Row({label, value}: {label: string; value: string}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-xs font-bold tracking-[0.1em] text-ink-muted uppercase">
        {label}
      </span>
      <span className="font-bold text-ink tabular-nums">{value}</span>
    </div>
  );
}

export function CatalogueGrid({
  projects,
  locale,
  showProgress
}: {
  projects: CatalogueCard[];
  locale: string;
  showProgress: boolean;
}) {
  const t = useTranslations('Catalog');
  const ts = useTranslations('ProjectStatus');
  const [filter, setFilter] = useState<Filter>('all');

  const tabs: {key: Filter; label: string}[] = [
    {key: 'all', label: t('filterAll')},
    {key: 'subscription', label: t('filterSubscription')},
    {key: 'ongoing', label: t('filterOngoing')},
    {key: 'closed', label: t('filterClosed')}
  ];

  const ordered = useMemo(() => {
    // `slice()` antes do sort: não mutar o array recebido nas props.
    return projects
      .slice()
      .sort((a, b) => BUCKET_RANK[bucketOf(a.status)] - BUCKET_RANK[bucketOf(b.status)]);
  }, [projects]);

  const visible =
    filter === 'all'
      ? ordered
      : ordered.filter((p) => bucketOf(p.status) === filter);

  return (
    <>
      <div
        role="tablist"
        aria-label={t('title')}
        className="mb-6 flex flex-wrap gap-2"
      >
        {tabs.map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.key)}
              className={
                active
                  ? 'rounded-full bg-brand-500 px-4 py-1.5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(0,107,255,0.24)]'
                  : 'rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold text-ink-muted transition hover:border-brand-200 hover:text-brand-600'
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center text-sm text-ink-muted">
            {t('emptyFiltered')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => {
            const pct =
              p.total_amount > 0
                ? Math.round((p.subscribed_amount / p.total_amount) * 100)
                : 0;
            return (
              <Link
                key={p.id}
                href={`/${locale}/projetos/${p.id}`}
                className="group"
              >
                <Card className="h-full gap-4 overflow-hidden pt-0 transition-all duration-200 group-hover:-translate-y-1 group-hover:border-brand-200 group-hover:shadow-[0_18px_40px_rgba(0,107,255,0.14)]">
                  <div className="relative">
                    {p.cover_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/projects/cover/${p.id}`}
                        alt={p.name}
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="grid aspect-video w-full place-items-center bg-gradient-to-br from-brand-50 to-brand-100 text-brand-300"
                      >
                        <ImageIcon className="size-7" />
                      </div>
                    )}
                    {/* Badge sobre a capa, canto superior direito: legível em
                        qualquer imagem graças ao fundo do próprio badge. */}
                    <Badge
                      variant={BADGE_VARIANT[p.status]}
                      className="absolute top-3 right-3 shadow-sm"
                    >
                      {ts(p.status)}
                    </Badge>
                  </div>
                  <CardHeader>
                    <CardTitle className="text-base font-bold text-ink group-hover:text-brand-600">
                      {p.name}
                    </CardTitle>
                    <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                      <MapPinIcon aria-hidden className="size-3.5 shrink-0" />
                      {p.location}
                    </p>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="divide-y divide-border">
                      <Row label={t('irr')} value={`${p.estimated_irr}%`} />
                      <Row label={t('amount')} value={eur(p.total_amount)} />
                      <Row
                        label={t('term')}
                        value={t('months', {n: p.term_months})}
                      />
                    </div>
                    {showProgress && (
                      <div className="pt-4">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{width: `${Math.min(100, pct)}%`}}
                          />
                        </div>
                        <p className="mt-2 text-xs font-semibold text-ink-muted tabular-nums">
                          {t('subscribed', {pct})}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
