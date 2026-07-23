import {getTranslations, setRequestLocale} from 'next-intl/server';
import {FolderOpenIcon} from 'lucide-react';
import {listCatalogue} from '@/lib/projects/service';
import {createAdminClient} from '@/lib/supabase/admin';
import {Card, CardContent} from '@/components/ui/card';
import type {Locale} from '@/lib/mail/templates';
import {CatalogueGrid} from './CatalogueGrid';

export const dynamic = 'force-dynamic';

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

      {projects.length === 0 ? (
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
      ) : (
        <CatalogueGrid
          projects={projects}
          locale={locale}
          showProgress={showProgress}
        />
      )}
    </main>
  );
}
