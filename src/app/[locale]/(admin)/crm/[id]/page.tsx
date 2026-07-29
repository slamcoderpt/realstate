import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {ArrowLeftIcon} from 'lucide-react';
import {getLeadDetailView} from '@/lib/crm/detail-dto';
import type {Locale} from '@/lib/mail/templates';
import {LeadDetail} from '../LeadDetail';

export const dynamic = 'force-dynamic';

/**
 * Página do detalhe da lead. O caminho normal é o modal do kanban; esta página
 * continua a existir como link direto e partilhável (é para aqui que apontam,
 * por exemplo, os follow-ups do board).
 */
export default async function LeadDetailPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const t = await getTranslations('Crm');

  const view = await getLeadDetailView(id, loc);
  if (!view) notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <a
          href={`/${locale}/crm`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t('back')}
        </a>
      </div>

      <LeadDetail locale={loc} view={view} />
    </main>
  );
}
