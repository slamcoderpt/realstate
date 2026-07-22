import {getTranslations, setRequestLocale} from 'next-intl/server';
import Link from 'next/link';
import {FolderOpenIcon, ImageIcon, MapPinIcon} from 'lucide-react';
import {listCatalogue} from '@/lib/projects/service';
import {createAdminClient} from '@/lib/supabase/admin';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

/** Linha rótulo/valor das fichas do catálogo. */
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

export default async function CatalogPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  setRequestLocale(loc);
  const t = await getTranslations('Catalog');

  const projects = await listCatalogue();

  // Flag de progresso de subscrição.
  const db = createAdminClient();
  const {data: flag} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'show_subscription_progress')
    .single();
  const showProgress = flag?.value === true;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-8 text-3xl font-extrabold tracking-tight text-ink">
        {t('title')}
      </h1>

      {projects.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <span
              aria-hidden
              className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-400"
            >
              <FolderOpenIcon className="size-6" />
            </span>
            <p className="max-w-sm text-sm text-ink-muted">{t('empty')}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const pct =
            p.total_amount > 0
              ? Math.round((p.subscribed_amount / p.total_amount) * 100)
              : 0;
          return (
            <Link key={p.id} href={`/${locale}/projetos/${p.id}`} className="group">
              <Card className="h-full gap-4 overflow-hidden pt-0 transition-all duration-200 group-hover:-translate-y-1 group-hover:border-brand-200 group-hover:shadow-[0_18px_40px_rgba(0,107,255,0.14)]">
                {p.cover_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/projects/cover/${p.id}`}
                    alt={p.name}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  // Sem capa a ficha mantém a mesma altura: o marcador ocupa
                  // exatamente o mesmo `aspect-video`.
                  <div
                    aria-hidden
                    className="grid aspect-video w-full place-items-center bg-gradient-to-br from-brand-50 to-brand-100 text-brand-300"
                  >
                    <ImageIcon className="size-7" />
                  </div>
                )}
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
    </main>
  );
}
