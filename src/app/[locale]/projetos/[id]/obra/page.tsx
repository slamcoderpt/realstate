import {getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {
  listMilestones,
  listWorkUpdates,
  listUpdateMedia
} from '@/lib/works/service';
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

type BudgetLineRow = {
  id: string;
  name: string;
  budget_amount: number;
  actual_amount: number;
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

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <a
          href={`/${locale}/projetos/${id}`}
          className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
        >
          {t('backToProject')}
        </a>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('milestones')}</h2>
        {milestones.length === 0 ? (
          <p className="text-sm text-neutral-500">{t('noMilestones')}</p>
        ) : (
          <ol className="space-y-3 border-l border-neutral-200 pl-5">
            {milestones.map((m) => (
              <li key={m.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.title}</span>
                  <span className="inline-block rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {t(`status_${m.status}` as 'status_previsto')}
                  </span>
                </div>
                <p className="font-mono text-xs text-neutral-500">
                  {t('planned')}: {dateFmt(loc, m.planned_date)} · {t('actual')}:{' '}
                  {dateFmt(loc, m.actual_date)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('budgetVsActual')}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium">{t('line')}</th>
              <th className="py-2 text-right font-medium">{t('budget')}</th>
              <th className="py-2 text-right font-medium">{t('spent')}</th>
              <th className="py-2 text-right font-medium">{t('deviation')}</th>
            </tr>
          </thead>
          <tbody>
            {budgetLines.map((line) => {
              const budget = Number(line.budget_amount);
              const actual = Number(line.actual_amount);
              const pct =
                budget > 0 ? ((actual - budget) / budget) * 100 : null;
              return (
                <tr key={line.id} className="border-b border-neutral-100">
                  <td className="py-2">{line.name}</td>
                  <td className="py-2 text-right font-mono">{eur(budget)}</td>
                  <td className="py-2 text-right font-mono">{eur(actual)}</td>
                  <td
                    className={`py-2 text-right font-mono ${
                      pct !== null && pct > 0
                        ? 'text-red-700'
                        : 'text-neutral-600'
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
        </table>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('diary')}</h2>
        {updates.length === 0 ? (
          <p className="text-sm text-neutral-500">{t('empty')}</p>
        ) : (
          <ul className="space-y-8">
            {updates.map((u) => {
              const items = mediaByUpdate.get(u.id) ?? [];
              return (
                <li key={u.id} className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="font-medium">{u.title}</h3>
                    <p className="font-mono text-xs text-neutral-500">
                      {dateFmt(loc, u.published_at)}
                    </p>
                  </div>
                  {u.body && (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">
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
                            className="aspect-video w-full rounded-lg object-cover"
                          />
                        ) : (
                          <video
                            key={m.id}
                            controls
                            src={`/api/works/media/${m.id}`}
                            className="aspect-video w-full rounded-lg bg-black"
                          />
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
