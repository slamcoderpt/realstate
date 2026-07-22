import {getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {FileTextIcon, MapPinIcon} from 'lucide-react';
import {getProjectDetail} from '@/lib/projects/service';
import {getMySubscription} from '@/lib/subscriptions/service';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import type {Locale} from '@/lib/mail/templates';
import {ManifestForm} from './ManifestForm';
import {cancelSubscriptionAction} from './actions';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';

export const dynamic = 'force-dynamic';

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

/**
 * Mosaico compacto: são oito lado a lado, por isso o rótulo é pequeno em caixa
 * alta e o número é o que salta. Sem ícones — a esta densidade seriam ruído.
 */
function StatTile({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="text-[0.6875rem] font-bold leading-tight tracking-[0.1em] text-ink-muted uppercase">
        {label}
      </p>
      <p className="mt-2 text-xl font-extrabold tracking-tight text-ink tabular-nums">
        {value}
      </p>
    </div>
  );
}

/** Cabeçalho de secção com filete de marca — decorativo, sem copy nova. */
function SectionTitle({children}: {children: React.ReactNode}) {
  return (
    <h2 className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-ink">
      <span aria-hidden className="h-4 w-1 rounded-full bg-brand-500" />
      {children}
    </h2>
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
  const ts = await getTranslations('ProjectStatus');
  const td = await getTranslations('ProjectDocType');
  const tsub = await getTranslations('Subscription');
  const tw = await getTranslations('Works');
  const te = await getTranslations('Statements');

  const session = await getSession();
  const staff = session ? isStaff(session.role) : false;

  const detail = await getProjectDetail(id, {staff, viewerId: session?.userId});
  if (!detail) notFound();

  const {project, budgetLines, photos, documents, indicators} = detail;

  const mine =
    session && !staff ? await getMySubscription(session.userId, id) : null;

  // Flag de progresso de subscrição.
  const db = createAdminClient();
  const {data: flag} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'show_subscription_progress')
    .single();
  const showProgress = flag?.value === true;

  const {data: minSetting} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'min_subscription_amount')
    .single();
  const minAmount =
    typeof minSetting?.value === 'number'
      ? minSetting.value
      : Number(minSetting?.value ?? 5000);

  const pct =
    project.total_amount > 0
      ? Math.round((project.subscribed_amount / project.total_amount) * 100)
      : 0;

  const th =
    'px-5 py-3 text-xs font-bold tracking-[0.12em] text-ink-muted uppercase';

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Duas colunas a partir de `lg`: a leitura do projeto à esquerda, a
          decisão à direita e fixa. Antes era uma coluna estreita ao centro —
          num ecrã de secretária ficava metade do espaço vazio e a posição do
          investidor só aparecia depois de rolar tudo. A barra lateral é
          `sticky` porque é isso que se quer à mão enquanto se lê o orçamento. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="min-w-0 space-y-10">
          {project.cover_path && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/projects/cover/${id}`}
              alt={project.name}
              className="aspect-video w-full rounded-[var(--radius-card)] object-cover shadow-[var(--shadow-card)]"
            />
          )}

          <header className="space-y-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              {project.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                <MapPinIcon aria-hidden className="size-4 shrink-0" />
                {project.location}
              </p>
              <Badge variant="secondary">{ts(project.status as 'preparacao')}</Badge>
            </div>
            {project.description && (
              <p className="max-w-2xl pt-1 text-sm leading-relaxed text-ink-soft">
                {project.description}
              </p>
            )}
          </header>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile label={t('amount')} value={eur(project.total_amount)} />
            <StatTile label={t('irr')} value={`${project.estimated_irr}%`} />
            <StatTile
              label={t('term')}
              value={t('months', {n: project.term_months})}
            />
            <StatTile label={t('roi')} value={`${indicators.roiPct.toFixed(1)}%`} />
            <StatTile label={t('margin')} value={eur(indicators.grossMargin)} />
            <StatTile
              label={t('acquisition')}
              value={eur(project.acquisition_cost)}
            />
            <StatTile label={t('works')} value={eur(project.works_budget)} />
            <StatTile label={t('arv')} value={eur(project.arv)} />
          </section>

          {photos.length > 0 && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo.id}
                  src={`/api/projects/photo/${photo.id}`}
                  alt={project.name}
                  className="aspect-video w-full rounded-[var(--radius-card)] object-cover shadow-[var(--shadow-card)]"
                />
              ))}
            </section>
          )}

          <section className="space-y-4">
            <SectionTitle>{t('budgetTitle')}</SectionTitle>
            <Card className="gap-0 overflow-hidden py-0">
              <div className="overflow-x-auto scroll-soft">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-left">
                      <th className={th}>{t('line')}</th>
                      <th className={th}>{t('phase')}</th>
                      <th className={`${th} text-right`}>{t('budgetAmount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {budgetLines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-5 py-4 font-semibold text-ink">
                          {line.name}
                        </td>
                        <td className="px-5 py-4 text-ink-muted">{line.phase}</td>
                        <td className="px-5 py-4 text-right font-bold text-ink tabular-nums">
                          {eur(line.budget_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* Condicional como as fotos: sem documentos, a secção desenhava um
              cartão branco vazio por baixo do título — pior do que não existir. */}
          {documents.length > 0 && (
            <section className="space-y-4">
            <SectionTitle>{t('docsTitle')}</SectionTitle>
            <Card className="py-2">
              <CardContent className="px-2">
                <ul className="divide-y divide-border text-sm">
                  {documents.map((doc) => (
                    <li key={doc.id}>
                      <a
                        href={`/api/projects/document/${doc.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold text-ink transition hover:bg-brand-50 hover:text-brand-700"
                      >
                        <span
                          aria-hidden
                          className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-500"
                        >
                          <FileTextIcon className="size-4" />
                        </span>
                        {td(doc.doc_type as 'caderneta_predial')}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            </section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24">
          <section className="space-y-4">
            <SectionTitle>{tsub('myPosition')}</SectionTitle>
            {mine ? (
              <Card>
                <CardContent className="space-y-4 text-sm">
                  <p className="text-2xl font-extrabold tracking-tight text-ink tabular-nums">
                    {tsub('positionAmount', {amount: eur(mine.amount)})}
                  </p>
                  <p>
                    <Badge variant="secondary">
                      {tsub(`status_${mine.status}` as 'status_interesse')}
                    </Badge>
                  </p>
                  {mine.status === 'interesse' && (
                    <>
                      <p className="text-xs text-ink-muted">
                        {tsub('contractPending')}
                      </p>
                      <form
                        action={cancelSubscriptionAction.bind(null, loc, id, mine.id)}
                      >
                        <Button type="submit" variant="outline" size="sm">
                          {tsub('cancel')}
                        </Button>
                      </form>
                    </>
                  )}
                  <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                    {/* Acompanhamento de obra: aberto a qualquer subscrição ativa. */}
                    <Button asChild variant="outline" size="sm">
                      <a href={`/${locale}/projetos/${id}/obra`}>{tw('title')}</a>
                    </Button>
                    {/* Extratos da conta dedicada: só com fundos confirmados. */}
                    {mine.status === 'fundos_confirmados' && (
                      <Button asChild variant="outline" size="sm">
                        <a href={`/${locale}/projetos/${id}/extratos`}>
                          {te('title')}
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : !staff && project.status === 'subscricao' ? (
              <Card className="max-w-md">
                <CardContent className="space-y-4">
                  <h3 className="text-sm font-bold tracking-tight text-ink">
                    {tsub('manifestTitle')}
                  </h3>
                  <ManifestForm locale={loc} projectId={id} min={minAmount} />
                </CardContent>
              </Card>
            ) : (
              <Card className="py-8">
                <CardContent>
                  <p className="text-center text-sm text-ink-muted">
                    {t('noPosition')}
                  </p>
                </CardContent>
              </Card>
            )}
          </section>

          {showProgress && (
            <section className="space-y-4">
              <SectionTitle>{t('subscriptionTitle')}</SectionTitle>
              <Card>
                <CardContent className="space-y-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-brand-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{width: `${Math.min(100, pct)}%`}}
                    />
                  </div>
                  <p className="text-sm font-bold text-ink tabular-nums">
                    {t('subscribedOf', {pct})}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {t('investorsCount', {
                      n: project.investor_count,
                      amount: eur(project.subscribed_amount)
                    })}
                  </p>
                </CardContent>
              </Card>
            </section>
          )}

          {/* O aviso de risco fica JUNTO da decisão e não no rodapé: é onde
              tem de ser lido, não onde é mais fácil de ignorar. */}
          <p className="text-xs leading-relaxed text-ink-muted">
            {t('riskNotice')}
          </p>
        </aside>
      </div>
    </main>
  );
}
