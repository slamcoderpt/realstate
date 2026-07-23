import {getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {
  ArrowLeftIcon,
  ClipboardListIcon,
  FileTextIcon,
  HardHatIcon,
  type LucideIcon
} from 'lucide-react';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {
  listMilestones,
  listWorkUpdates,
  listUpdateMedia,
  listWorkDocuments,
  type MilestoneStatus
} from '@/lib/works/service';
import {Badge} from '@/components/ui/badge';
import {Card, CardContent} from '@/components/ui/card';
import {BudgetChart} from '@/components/charts/BudgetChart';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

function dateFmt(loc: Locale, value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(loc === 'en' ? 'en-GB' : 'pt-PT', {
    dateStyle: 'medium'
  }).format(new Date(value));
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

function EmptyState({
  icon: Icon,
  children
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Card className="py-10">
      <CardContent className="flex flex-col items-center gap-4 text-center">
        <span
          aria-hidden
          className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-400"
        >
          <Icon className="size-6" />
        </span>
        <p className="max-w-sm text-sm text-ink-muted">{children}</p>
      </CardContent>
    </Card>
  );
}

type BudgetLineRow = {
  id: string;
  name: string;
  budget_amount: number;
  actual_amount: number;
};

// Ponto do marco na timeline: concluído sólido, em curso a meio-tom, previsto
// discreto — a cor conta a história sem depender do rótulo.
const MILESTONE_DOT: Record<MilestoneStatus, string> = {
  concluido: 'bg-brand-500',
  em_curso: 'bg-brand-300',
  previsto: 'bg-border'
};

export default async function ObraPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  setRequestLocale(loc);
  const t = await getTranslations('Works');

  const session = await getSession();
  if (!session) notFound();

  const db = createAdminClient();

  // A obra é visível a staff e a quem tem subscrição ATIVA no projeto
  // (`status <> 'cancelada'`) — o mesmo critério da RLS. Deliberadamente mais
  // permissivo do que os extratos, que exigem `fundos_confirmados`.
  let allowed = isStaff(session.role);
  if (!allowed) {
    const {count} = await db
      .from('subscriptions')
      .select('id', {count: 'exact', head: true})
      .eq('project_id', id)
      .eq('user_id', session.userId)
      .neq('status', 'cancelada');
    allowed = (count ?? 0) > 0;
  }
  if (!allowed) notFound();

  const milestones = await listMilestones(id, db);
  // % de acabamento da obra derivada dos marcos (concluídos ÷ total) — sem
  // campo manual: é o próprio plano de marcos que dá o progresso.
  const doneCount = milestones.filter((m) => m.status === 'concluido').length;
  const completionPct =
    milestones.length > 0
      ? Math.round((doneCount / milestones.length) * 100)
      : 0;

  const updates = await listWorkUpdates(id, db);
  const media = await listUpdateMedia(
    updates.map((u) => u.id),
    db
  );
  const mediaByUpdate = new Map<string, typeof media>();
  for (const m of media) {
    const list = mediaByUpdate.get(m.work_update_id) ?? [];
    list.push(m);
    mediaByUpdate.set(m.work_update_id, list);
  }

  const {data: lines} = await db
    .from('project_budget_lines')
    .select('id, name, budget_amount, actual_amount')
    .eq('project_id', id)
    .order('sort_order', {ascending: true});
  const budgetLines = (lines ?? []) as BudgetLineRow[];

  // Totais agregados da obra: Σ orçamento vs Σ executado, desvio global e % de
  // execução (quanto do orçamento já foi gasto). Dá a leitura de conjunto que
  // as linhas por rubrica, sozinhas, não davam.
  const totalBudget = budgetLines.reduce(
    (sum, l) => sum + Number(l.budget_amount),
    0
  );
  const totalActual = budgetLines.reduce(
    (sum, l) => sum + Number(l.actual_amount),
    0
  );
  const globalDeviationPct =
    totalBudget > 0 ? ((totalActual - totalBudget) / totalBudget) * 100 : null;
  const executionPct =
    totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;

  const documents = await listWorkDocuments(id, db);
  const lineName = new Map(budgetLines.map((l) => [l.id, l.name]));
  const updateTitle = new Map(updates.map((u) => [u.id, u.title]));

  const th =
    'px-5 py-3 text-xs font-bold tracking-[0.12em] text-ink-muted uppercase';

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      {/* Staff chega aqui pelo "Ver como investidor" da gestão de obra. Dizer
          que é pré-visualização evita a dúvida de estar a ver a página certa —
          é a mesma para toda a gente, só o caminho é que difere. */}
      {isStaff(session.role) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-brand-200 bg-brand-50 px-5 py-3.5">
          <p className="text-sm font-semibold text-brand-700">
            {t('staffPreview')}
          </p>
          <a
            href={`/${locale}/gestao-projetos/${id}/obra`}
            className="text-sm font-bold text-brand-700 underline-offset-4 hover:underline"
          >
            {t('backToAdmin')}
          </a>
        </div>
      )}

      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          {t('title')}
        </h1>
        <a
          href={`/${locale}/projetos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t('backToProject')}
        </a>
      </header>

      {/* Destaque de progresso: os marcos deixam de viver só numa barra lateral
          estreita — a % de acabamento abre a página, é a primeira leitura da
          obra. Só aparece quando há marcos (sem eles não há progresso a medir). */}
      {milestones.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold tracking-[0.12em] text-ink-muted uppercase">
                {t('workProgress')}
              </p>
              <p className="text-4xl font-extrabold tracking-tight text-ink tabular-nums">
                {completionPct}%
              </p>
              <p className="text-sm text-ink-muted">
                {t('milestonesDone', {
                  done: doneCount,
                  total: milestones.length
                })}
              </p>
            </div>
            <div
              className="w-full sm:max-w-xs"
              role="progressbar"
              aria-valuenow={completionPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('completionHint')}
            >
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-100">
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
                  style={{width: `${completionPct}%`}}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mesmo corte da ficha do projeto: a leitura à esquerda, a orientação à
          direita e fixa. Os marcos são o "onde vamos" — quer-se à vista
          enquanto se percorre o diário, não a rolar por cima dele. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="min-w-0 space-y-10">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <SectionTitle>{t('budgetVsActual')}</SectionTitle>
              {totalBudget > 0 && (
                <p className="text-sm font-semibold text-ink-muted">
                  {t('budgetExecution')}:{' '}
                  <span className="text-ink tabular-nums">{executionPct}%</span>
                </p>
              )}
            </div>
            {/* Gráfico de conjunto (orçado vs executado por rubrica) antes da
                tabela: a leitura visual primeiro, o detalhe ao cêntimo depois. */}
            {budgetLines.length > 0 && (
              <Card className="py-5">
                <CardContent>
                  <BudgetChart
                    data={budgetLines.map((l) => ({
                      name: l.name,
                      budget: Number(l.budget_amount),
                      actual: Number(l.actual_amount)
                    }))}
                  />
                </CardContent>
              </Card>
            )}
            <Card className="gap-0 overflow-hidden py-0">
              <div className="overflow-x-auto scroll-soft">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-left">
                      <th className={th}>{t('line')}</th>
                      <th className={`${th} text-right`}>{t('budget')}</th>
                      <th className={`${th} text-right`}>{t('spent')}</th>
                      <th className={`${th} text-right`}>{t('deviation')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {budgetLines.map((line) => {
                      const budget = Number(line.budget_amount);
                      const actual = Number(line.actual_amount);
                      const pct =
                        budget > 0 ? ((actual - budget) / budget) * 100 : null;
                      return (
                        <tr key={line.id}>
                          <td className="px-5 py-4 font-semibold text-ink">
                            {line.name}
                          </td>
                          <td className="px-5 py-4 text-right text-ink-soft tabular-nums">
                            {eur(budget)}
                          </td>
                          <td className="px-5 py-4 text-right font-bold text-ink tabular-nums">
                            {eur(actual)}
                          </td>
                          {/* Derrapagem a vermelho: é a única cor semântica que
                              sobrevive à mudança de marca, e tem de continuar a
                              saltar à vista sobre o fundo azulado. */}
                          <td
                            className={`px-5 py-4 text-right font-bold tabular-nums ${
                              pct !== null && pct > 0
                                ? 'text-destructive'
                                : 'text-ink-muted'
                            }`}
                          >
                            {pct === null
                              ? '—'
                              : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {budgetLines.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-secondary">
                        <td className="px-5 py-4 text-xs font-bold tracking-[0.1em] text-ink uppercase">
                          {t('total')}
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-ink tabular-nums">
                          {eur(totalBudget)}
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-ink tabular-nums">
                          {eur(totalActual)}
                        </td>
                        <td
                          className={`px-5 py-4 text-right font-bold tabular-nums ${
                            globalDeviationPct !== null && globalDeviationPct > 0
                              ? 'text-destructive'
                              : 'text-ink-muted'
                          }`}
                        >
                          {globalDeviationPct === null
                            ? '—'
                            : `${globalDeviationPct > 0 ? '+' : ''}${globalDeviationPct.toFixed(1)}%`}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionTitle>{t('diary')}</SectionTitle>
            {updates.length === 0 ? (
              <EmptyState icon={HardHatIcon}>{t('empty')}</EmptyState>
            ) : (
              <ul className="space-y-5">
                {updates.map((u) => {
                  const items = mediaByUpdate.get(u.id) ?? [];
                  return (
                    <li key={u.id}>
                      <Card>
                        <CardContent className="space-y-4">
                          <div className="space-y-1">
                            <h3 className="text-base font-bold tracking-tight text-ink">
                              {u.title}
                            </h3>
                            <p className="text-xs font-semibold text-ink-muted tabular-nums">
                              {dateFmt(loc, u.published_at)}
                            </p>
                          </div>
                          {u.body && (
                            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                              {u.body}
                            </p>
                          )}
                          {items.length > 0 && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {items.map((m) =>
                                m.media_type === 'photo' ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={m.id}
                                    src={`/api/works/media/${m.id}`}
                                    alt={u.title}
                                    className="aspect-video w-full rounded-2xl object-cover"
                                  />
                                ) : (
                                  <video
                                    key={m.id}
                                    controls
                                    src={`/api/works/media/${m.id}`}
                                    className="aspect-video w-full rounded-2xl bg-ink"
                                  />
                                )
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Documentos e faturas da obra: a "pasta do projeto" para quem
              investiu. Cada documento diz a que se liga (rubrica, atualização,
              ou projeto). Só aparece quando há documentos. */}
          {documents.length > 0 && (
            <section className="space-y-4">
              <SectionTitle>{t('documents')}</SectionTitle>
              <Card className="py-2">
                <CardContent className="px-2">
                  <ul className="divide-y divide-border text-sm">
                    {documents.map((doc) => {
                      const assoc = doc.budget_line_id
                        ? `${t('docAssocLine')}: ${lineName.get(doc.budget_line_id) ?? '—'}`
                        : doc.work_update_id
                          ? `${t('docAssocUpdate')}: ${updateTitle.get(doc.work_update_id) ?? '—'}`
                          : t('docAssocProject');
                      return (
                        <li key={doc.id}>
                          <a
                            href={`/api/works/document/${doc.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-brand-50"
                          >
                            <span
                              aria-hidden
                              className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-500"
                            >
                              <FileTextIcon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-ink">
                                {doc.original_filename}
                              </span>
                              <span className="block text-xs text-ink-muted">
                                {assoc}
                              </span>
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24">
          <section className="space-y-4">
            <SectionTitle>{t('milestones')}</SectionTitle>
            {milestones.length === 0 ? (
              <EmptyState icon={ClipboardListIcon}>{t('noMilestones')}</EmptyState>
            ) : (
              <Card>
                <CardContent>
                  <ol className="space-y-5 border-l-2 border-brand-100 pl-6">
                    {milestones.map((m) => (
                      <li key={m.id} className="relative space-y-1.5">
                        <span
                          aria-hidden
                          className={`absolute top-1.5 -left-[1.9375rem] size-3 rounded-full ring-4 ring-card ${MILESTONE_DOT[m.status]}`}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-ink">{m.title}</span>
                          <Badge variant="secondary">
                            {t(`status_${m.status}` as 'status_previsto')}
                          </Badge>
                        </div>
                        <p className="text-xs text-ink-muted tabular-nums">
                          {t('planned')}: {dateFmt(loc, m.planned_date)} ·{' '}
                          {t('actual')}: {dateFmt(loc, m.actual_date)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
