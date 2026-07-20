import {getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {getProjectDetail} from '@/lib/projects/service';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

// TODO i18n: rótulos definitivos de doc_type são adicionados na tarefa final de
// i18n; por agora um mapa PT inline.
const DOC_TYPE_LABEL: Record<string, string> = {
  caderneta_predial: 'Caderneta predial',
  licenca: 'Licença',
  orcamento_empreiteiro: 'Orçamento do empreiteiro',
  apolice_seguro: 'Apólice de seguro',
  outro: 'Outro'
};

function StatTile({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-mono text-lg">{value}</p>
    </div>
  );
}

export default async function ProjectDetailPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  setRequestLocale(loc);
  const t = await getTranslations('ProjectDetail');

  const session = await getSession();
  const staff = session ? isStaff(session.role) : false;

  const detail = await getProjectDetail(id, {staff});
  if (!detail) notFound();

  const {project, budgetLines, photos, documents, indicators} = detail;

  // Flag de progresso de subscrição.
  const db = createAdminClient();
  const {data: flag} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'show_subscription_progress')
    .single();
  const showProgress = flag?.value === true;

  const pct =
    project.total_amount > 0
      ? Math.round((project.subscribed_amount / project.total_amount) * 100)
      : 0;

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-sm text-neutral-500">{project.location}</p>
        <span className="inline-block rounded bg-neutral-100 px-2 py-0.5 text-xs font-mono text-neutral-600">
          {project.status}
        </span>
        {project.description && (
          <p className="pt-2 text-sm leading-relaxed text-neutral-700">
            {project.description}
          </p>
        )}
      </header>

      {photos.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={`/api/projects/photo/${photo.id}`}
              alt={project.name}
              className="aspect-video w-full rounded-lg object-cover"
            />
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label={t('amount')} value={eur(project.total_amount)} />
        <StatTile label={t('irr')} value={`${project.estimated_irr}%`} />
        <StatTile
          label={t('term')}
          value={t('months', {n: project.term_months})}
        />
        <StatTile label={t('roi')} value={`${indicators.roiPct.toFixed(1)}%`} />
        <StatTile label={t('margin')} value={eur(indicators.grossMargin)} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('budgetTitle')}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium">{t('line')}</th>
              <th className="py-2 font-medium">{t('phase')}</th>
              <th className="py-2 text-right font-medium">{t('budgetAmount')}</th>
            </tr>
          </thead>
          <tbody>
            {budgetLines.map((line) => (
              <tr key={line.id} className="border-b border-neutral-100">
                <td className="py-2">{line.name}</td>
                <td className="py-2 text-neutral-500">{line.phase}</td>
                <td className="py-2 text-right font-mono">
                  {eur(line.budget_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('docsTitle')}</h2>
        <ul className="space-y-2 text-sm">
          {documents.map((doc) => (
            <li key={doc.id}>
              <a
                href={`/api/projects/document/${doc.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-800 underline underline-offset-2 hover:text-neutral-950"
              >
                {DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {showProgress && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('subscriptionTitle')}</h2>
          <div className="h-2 w-full rounded bg-neutral-200">
            <div
              className="h-full rounded bg-neutral-800"
              style={{width: `${Math.min(100, pct)}%`}}
            />
          </div>
          <p className="font-mono text-xs text-neutral-500">
            {t('subscribedOf', {pct})}
          </p>
          <p className="text-xs text-neutral-500">
            {t('investorsCount', {
              n: project.investor_count,
              amount: eur(project.subscribed_amount)
            })}
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('myPosition')}</h2>
        <p className="text-sm text-neutral-500">{t('noPosition')}</p>
      </section>

      <p className="border-t border-neutral-200 pt-6 text-xs leading-relaxed text-neutral-400">
        {t('riskNotice')}
      </p>
    </main>
  );
}
