import {getTranslations} from 'next-intl/server';
import {ExternalLinkIcon} from 'lucide-react';
import {
  listMilestones,
  listWorkUpdates,
  listUpdateMedia,
  type MilestoneStatus
} from '@/lib/works/service';
import {createAdminClient} from '@/lib/supabase/admin';
import {
  addMilestoneAction,
  updateMilestoneAction,
  setActualAmountAction,
  publishUpdateAction
} from './actions';
import {MediaUploader} from './MediaUploader';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

const eur = (v: number) =>
  new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(Number(v));

const STATUSES: MilestoneStatus[] = ['previsto', 'em_curso', 'concluido'];

/**
 * Painel de tabela da marca. O `<Table>` traz o seu próprio contentor com
 * `overflow-x-auto`; anula-se aqui (`[&>div]:overflow-visible`) para que quem
 * rola seja este invólucro — é ele que tem a barra fina de `.scroll-soft`.
 */
const TABLE_PANEL =
  'scroll-soft overflow-x-auto rounded-[var(--radius-card)] border border-border bg-card shadow-[var(--shadow-card)] [&>div]:overflow-visible';
const TH =
  'h-12 px-5 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';
const TD = 'px-5 py-4 align-middle text-ink-soft';
const PANEL =
  'rounded-[var(--radius-card)] border border-border bg-card p-5 shadow-[var(--shadow-card)]';
const EMPTY =
  'rounded-[var(--radius-card)] border border-border bg-card px-6 py-14 text-center text-sm text-ink-muted shadow-[var(--shadow-card)]';
const FIELD_LABEL = 'font-semibold text-ink';
const SECTION_TITLE = 'text-lg font-bold tracking-tight text-ink';
const CONTROL_BASE =
  'rounded-xl border border-input bg-white text-ink shadow-[0_1px_2px_rgba(7,18,53,0.04)] outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const SELECT_SM = `h-9 px-3 text-sm ${CONTROL_BASE}`;
const SELECT = `h-11 w-full px-3.5 text-sm ${CONTROL_BASE}`;
const TEXTAREA = `w-full px-3.5 py-2.5 text-sm ${CONTROL_BASE}`;

type BudgetLineRow = {
  id: string;
  name: string;
  phase: string;
  budget_amount: number;
  actual_amount: number;
};

export default async function GestaoObraPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const ta = await getTranslations('WorksAdmin');
  const tw = await getTranslations('Works');
  const tp = await getTranslations('ProjectAdmin');

  const milestones = await listMilestones(id);
  const updates = await listWorkUpdates(id);
  const media = await listUpdateMedia(updates.map((u) => u.id));
  const mediaCount = new Map<string, number>();
  for (const m of media) {
    mediaCount.set(m.work_update_id, (mediaCount.get(m.work_update_id) ?? 0) + 1);
  }

  const db = createAdminClient();
  const {data: lines} = await db
    .from('project_budget_lines')
    .select('id, name, phase, budget_amount, actual_amount')
    .eq('project_id', id)
    .order('sort_order', {ascending: true});
  const budgetLines = (lines ?? []) as BudgetLineRow[];

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-500">
          {tp('title')}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              {ta('title')}
            </h1>
            <a
              href={`/${locale}/gestao-projetos/${id}`}
              className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100"
            >
              {tw('backToProject')}
            </a>
          </div>
          {/* O que aqui se publica só se vê como o investidor o vê na página de
              acompanhamento — que staff sempre pôde abrir, mas só escrevendo o
              URL à mão. */}
          <Button asChild variant="outline">
            <a
              href={`/${locale}/projetos/${id}/obra`}
              target="_blank"
              rel="noreferrer"
            >
              {tp('viewAsInvestor')}
              <ExternalLinkIcon aria-hidden className="size-4" />
            </a>
          </Button>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{tw('milestones')}</h2>
        {milestones.length === 0 ? (
          <p className={EMPTY}>{tw('noMilestones')}</p>
        ) : (
          <div className={TABLE_PANEL}>
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-secondary hover:bg-secondary">
                  <TableHead className={TH}>{ta('milestoneTitle')}</TableHead>
                  <TableHead className={TH}>{ta('plannedDate')}</TableHead>
                  <TableHead className={TH}>{ta('actualDate')}</TableHead>
                  <TableHead className={TH}>{ta('status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {milestones.map((m) => (
                  <TableRow
                    key={m.id}
                    className="border-border hover:bg-brand-50/60"
                  >
                    <TableCell className={`${TD} font-semibold text-ink`}>
                      {m.title}
                    </TableCell>
                    <TableCell className={`${TD} tabular-nums`}>
                      {m.planned_date ?? (
                        <span className="text-ink-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell className={TD} colSpan={2}>
                      <form
                        action={updateMilestoneAction.bind(null, loc, id, m.id)}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Input
                          type="date"
                          name="actual_date"
                          aria-label={ta('actualDate')}
                          defaultValue={m.actual_date ?? ''}
                          className="h-9 w-44"
                        />
                        <select
                          name="status"
                          aria-label={ta('status')}
                          defaultValue={m.status}
                          className={SELECT_SM}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {tw(`status_${s}` as 'status_previsto')}
                            </option>
                          ))}
                        </select>
                        <Badge variant="secondary">
                          {tw(`status_${m.status}` as 'status_previsto')}
                        </Badge>
                        <Button type="submit" size="sm">
                          {ta('save')}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <form
          action={addMilestoneAction.bind(null, loc, id)}
          className={`flex flex-wrap items-end gap-4 ${PANEL}`}
        >
          <div className="flex-1 space-y-2" style={{minWidth: 200}}>
            <Label htmlFor="milestone_title" className={FIELD_LABEL}>
              {ta('milestoneTitle')}
            </Label>
            <Input id="milestone_title" name="title" required />
          </div>
          <div className="space-y-2" style={{minWidth: 160}}>
            <Label htmlFor="milestone_planned" className={FIELD_LABEL}>
              {ta('plannedDate')}
            </Label>
            <Input id="milestone_planned" name="planned_date" type="date" />
          </div>
          <Button type="submit">{ta('addMilestone')}</Button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{tw('diary')}</h2>

        <form
          action={publishUpdateAction.bind(null, loc, id)}
          className={`space-y-5 ${PANEL}`}
        >
          <div className="space-y-2">
            <Label htmlFor="update_title" className={FIELD_LABEL}>
              {ta('updateTitle')}
            </Label>
            <Input id="update_title" name="title" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="update_body" className={FIELD_LABEL}>
              {ta('updateBody')}
            </Label>
            <textarea
              id="update_body"
              name="body"
              rows={4}
              required
              className={TEXTAREA}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="update_milestone" className={FIELD_LABEL}>
              {ta('linkMilestone')}
            </Label>
            <select
              id="update_milestone"
              name="milestone_id"
              defaultValue=""
              className={SELECT}
            >
              <option value="">{ta('none')}</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">{ta('publishUpdate')}</Button>
        </form>

        {updates.length === 0 ? (
          <p className={EMPTY}>{tw('empty')}</p>
        ) : (
          <ul className="space-y-4">
            {updates.map((u) => (
              <li key={u.id} className={`space-y-3 ${PANEL}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-bold tracking-tight text-ink">
                    {u.title}
                  </h3>
                  <span className="text-xs font-medium tabular-nums text-ink-muted">
                    {u.published_at.slice(0, 10)}
                  </span>
                  <Badge variant="secondary">
                    {ta('media')}: {mediaCount.get(u.id) ?? 0}
                  </Badge>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                  {u.body}
                </p>
                <MediaUploader locale={loc} projectId={id} updateId={u.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{tw('budgetVsActual')}</h2>
        <div className={TABLE_PANEL}>
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-secondary hover:bg-secondary">
                <TableHead className={TH}>{tw('line')}</TableHead>
                <TableHead className={TH}>{tp('linePhase')}</TableHead>
                <TableHead className={`${TH} text-right`}>
                  {tw('budget')}
                </TableHead>
                <TableHead className={TH}>{tw('spent')}</TableHead>
                <TableHead className={`${TH} text-right`}>
                  {tw('deviation')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgetLines.map((line) => {
                const budget = Number(line.budget_amount);
                const actual = Number(line.actual_amount);
                const deviation =
                  budget > 0
                    ? `${(((actual - budget) / budget) * 100).toFixed(1)}%`
                    : '—';
                return (
                  <TableRow
                    key={line.id}
                    className="border-border hover:bg-brand-50/60"
                  >
                    <TableCell className={`${TD} font-semibold text-ink`}>
                      {line.name}
                    </TableCell>
                    <TableCell className={TD}>{line.phase}</TableCell>
                    <TableCell
                      className={`${TD} text-right font-semibold tabular-nums text-ink`}
                    >
                      {eur(budget)}
                    </TableCell>
                    <TableCell className={TD}>
                      <form
                        action={setActualAmountAction.bind(
                          null,
                          loc,
                          id,
                          line.id
                        )}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Input
                          type="number"
                          step="0.01"
                          name="actual_amount"
                          aria-label={ta('actualAmount')}
                          defaultValue={actual}
                          className="h-9 w-36"
                        />
                        <Button type="submit" size="sm">
                          {ta('saveActuals')}
                        </Button>
                      </form>
                    </TableCell>
                    <TableCell
                      className={`${TD} text-right font-semibold tabular-nums text-ink`}
                    >
                      {deviation}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  );
}
