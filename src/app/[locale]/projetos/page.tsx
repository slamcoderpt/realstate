import {getTranslations, setRequestLocale} from 'next-intl/server';
import Link from 'next/link';
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
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      {projects.length === 0 && (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const pct =
            p.total_amount > 0
              ? Math.round((p.subscribed_amount / p.total_amount) * 100)
              : 0;
          return (
            <Link key={p.id} href={`/${locale}/projetos/${p.id}`}>
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <p className="text-sm text-neutral-500">{p.location}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('irr')}</span>
                    <span className="font-mono">{p.estimated_irr}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('amount')}</span>
                    <span className="font-mono">{eur(p.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('term')}</span>
                    <span className="font-mono">
                      {t('months', {n: p.term_months})}
                    </span>
                  </div>
                  {showProgress && (
                    <div className="pt-2">
                      <div className="h-1.5 w-full rounded bg-neutral-200">
                        <div
                          className="h-full rounded bg-neutral-800"
                          style={{width: `${Math.min(100, pct)}%`}}
                        />
                      </div>
                      <p className="mt-1 font-mono text-xs text-neutral-500">
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
