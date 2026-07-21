import {getTranslations} from 'next-intl/server';
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
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{ta('title')}</h1>
        <a
          href={`/${locale}/gestao-projetos/${id}`}
          className="text-sm text-blue-700 underline"
        >
          {tw('backToProject')}
        </a>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{tw('milestones')}</h2>
        {milestones.length === 0 ? (
          <p className="text-sm text-neutral-500">{tw('noMilestones')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ta('milestoneTitle')}</TableHead>
                <TableHead>{ta('plannedDate')}</TableHead>
                <TableHead>{ta('actualDate')}</TableHead>
                <TableHead>{ta('status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {milestones.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.title}</TableCell>
                  <TableCell>
                    {m.planned_date ?? (
                      <span className="text-neutral-400">—</span>
                    )}
                  </TableCell>
                  <TableCell colSpan={2}>
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
                        className="rounded-md border p-2 text-sm"
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
        )}

        <form
          action={addMilestoneAction.bind(null, loc, id)}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1" style={{minWidth: 200}}>
            <Label htmlFor="milestone_title">{ta('milestoneTitle')}</Label>
            <Input id="milestone_title" name="title" required />
          </div>
          <div style={{minWidth: 160}}>
            <Label htmlFor="milestone_planned">{ta('plannedDate')}</Label>
            <Input id="milestone_planned" name="planned_date" type="date" />
          </div>
          <Button type="submit">{ta('addMilestone')}</Button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{tw('diary')}</h2>

        <form
          action={publishUpdateAction.bind(null, loc, id)}
          className="space-y-3 rounded-md border p-4"
        >
          <div>
            <Label htmlFor="update_title">{ta('updateTitle')}</Label>
            <Input id="update_title" name="title" required />
          </div>
          <div>
            <Label htmlFor="update_body">{ta('updateBody')}</Label>
            <textarea
              id="update_body"
              name="body"
              rows={4}
              required
              className="w-full rounded-md border p-2 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="update_milestone">{ta('linkMilestone')}</Label>
            <select
              id="update_milestone"
              name="milestone_id"
              defaultValue=""
              className="w-full rounded-md border p-2 text-sm"
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
          <p className="text-sm text-neutral-500">{tw('empty')}</p>
        ) : (
          <ul className="space-y-4">
            {updates.map((u) => (
              <li key={u.id} className="space-y-2 rounded-md border p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-medium">{u.title}</h3>
                  <span className="text-xs text-neutral-500">
                    {u.published_at.slice(0, 10)}
                  </span>
                  <Badge variant="secondary">
                    {ta('media')}: {mediaCount.get(u.id) ?? 0}
                  </Badge>
                </div>
                <p className="whitespace-pre-line text-sm text-neutral-700">
                  {u.body}
                </p>
                <MediaUploader locale={loc} projectId={id} updateId={u.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{tw('budgetVsActual')}</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tw('line')}</TableHead>
              <TableHead>{tp('linePhase')}</TableHead>
              <TableHead className="text-right">{tw('budget')}</TableHead>
              <TableHead>{tw('spent')}</TableHead>
              <TableHead className="text-right">{tw('deviation')}</TableHead>
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
                <TableRow key={line.id}>
                  <TableCell className="font-medium">{line.name}</TableCell>
                  <TableCell>{line.phase}</TableCell>
                  <TableCell className="text-right">{eur(budget)}</TableCell>
                  <TableCell>
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
                  <TableCell className="text-right">{deviation}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}
