import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {ArrowLeftIcon} from 'lucide-react';
import {createAdminClient} from '@/lib/supabase/admin';
import {
  getLeadDetail,
  CRM_STAGES,
  CRM_SOURCES,
  CRM_PROFILES,
  type CrmActivityType
} from '@/lib/crm/service';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {Card, CardContent} from '@/components/ui/card';
import type {Locale} from '@/lib/mail/templates';
import {
  updateLeadAction,
  addActivityAction,
  moveLeadStageFormAction,
  convertLeadToInviteAction
} from '../actions';
import {UserCheckIcon, SendIcon} from 'lucide-react';

export const dynamic = 'force-dynamic';

const CONTROL =
  'h-11 w-full rounded-xl border border-input bg-white px-3.5 text-sm text-ink outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const LABEL = 'font-semibold text-ink';
const ACTIVITY_TYPES: CrmActivityType[] = [
  'nota',
  'chamada',
  'email',
  'reuniao'
];

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

export default async function LeadDetailPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const t = await getTranslations('Crm');

  const detail = await getLeadDetail(id);
  if (!detail) notFound();
  const {lead, activities} = detail;

  // Nomes dos autores das atividades (um fetch).
  const authorIds = [
    ...new Set(activities.map((a) => a.author_id).filter((v): v is string => !!v))
  ];
  const authorName = new Map<string, string>();
  if (authorIds.length > 0) {
    const db = createAdminClient();
    const {data} = await db
      .from('profiles')
      .select('id, full_name')
      .in('id', authorIds);
    for (const p of data ?? [])
      authorName.set(p.id as string, (p.full_name as string) || '');
  }

  const dateFmt = (v: string) =>
    new Intl.DateTimeFormat(loc === 'en' ? 'en-GB' : 'pt-PT', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(v));

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

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            {lead.full_name}
          </h1>
          <Badge variant="secondary">
            {t(`stage_${lead.stage}` as 'stage_novo')}
          </Badge>
        </div>
        {/* Conversão: se já foi convertido mostra o estado; senão, o botão que
            cria o convite (reutiliza o mecanismo de convites existente). */}
        {lead.converted_user_id ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
            <UserCheckIcon aria-hidden className="size-4" />
            {t('convertedUser')}
          </span>
        ) : lead.converted_invite_id ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
            <SendIcon aria-hidden className="size-4" />
            {t('convertedInvite')}
          </span>
        ) : (
          <form action={convertLeadToInviteAction.bind(null, loc, id)}>
            <Button type="submit" title={t('convertHint')}>
              <SendIcon aria-hidden className="size-4" />
              {t('convert')}
            </Button>
          </form>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-end">
        {/* Mudar de estado também a partir do detalhe (além do arrastar). */}
        <form
          action={moveLeadStageFormAction.bind(null, loc, id)}
          className="flex items-center gap-2"
        >
          <span className="text-sm font-semibold text-ink-muted">
            {t('moveTo')}
          </span>
          <select name="stage" defaultValue={lead.stage} className={`${CONTROL} h-9 w-44`}>
            {CRM_STAGES.map((s) => (
              <option key={s} value={s}>
                {t(`stage_${s}` as 'stage_novo')}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm">
            {t('save')}
          </Button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* Timeline + registar atividade */}
        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-4">
              <h2 className="text-sm font-bold tracking-tight text-ink">
                {t('addActivity')}
              </h2>
              <form
                action={addActivityAction.bind(null, loc, id)}
                className="space-y-3"
              >
                <div className="flex flex-wrap gap-3">
                  <select name="type" defaultValue="nota" className={`${CONTROL} w-40`}>
                    {ACTIVITY_TYPES.map((a) => (
                      <option key={a} value={a}>
                        {t(`type_${a}` as 'type_nota')}
                      </option>
                    ))}
                  </select>
                  <Input
                    name="due_at"
                    type="date"
                    aria-label={t('dueAt')}
                    className="h-11 w-44"
                  />
                </div>
                <textarea
                  name="body"
                  rows={3}
                  placeholder={t('activityBody')}
                  className={`${CONTROL} h-auto py-2.5`}
                />
                <Button type="submit" size="sm">
                  {t('save')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h2 className="text-sm font-bold tracking-tight text-ink">
              {t('timeline')}
            </h2>
            {activities.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-border bg-card px-5 py-8 text-center text-sm text-ink-muted">
                {t('noActivities')}
              </p>
            ) : (
              <ul className="space-y-2">
                {activities.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border border-border bg-card p-3.5 text-sm shadow-[var(--shadow-card)]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {t(`type_${a.type}` as 'type_nota')}
                      </Badge>
                      <span className="text-xs text-ink-muted tabular-nums">
                        {dateFmt(a.created_at)}
                      </span>
                      {a.author_id && authorName.get(a.author_id) && (
                        <span className="text-xs text-ink-muted">
                          · {authorName.get(a.author_id)}
                        </span>
                      )}
                      {a.due_at && (
                        <span className="text-xs font-semibold text-brand-600">
                          · {t('dueAt')}: {dateFmt(a.due_at)}
                        </span>
                      )}
                    </div>
                    {a.body && (
                      <p className="mt-1.5 whitespace-pre-line text-ink-soft">
                        {a.body}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Detalhes / edição */}
        <Card className="lg:sticky lg:top-24">
          <CardContent>
            <h2 className="mb-4 text-sm font-bold tracking-tight text-ink">
              {t('details')}
            </h2>
            <form
              action={updateLeadAction.bind(null, loc, id)}
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor="full_name" className={LABEL}>
                  {t('fullName')}
                </Label>
                <Input id="full_name" name="full_name" defaultValue={lead.full_name} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className={LABEL}>
                  {t('email')}
                </Label>
                <Input id="email" name="email" type="email" defaultValue={lead.email} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className={LABEL}>
                  {t('phone')}
                </Label>
                <Input id="phone" name="phone" defaultValue={lead.phone} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="source" className={LABEL}>
                  {t('source')}
                </Label>
                <select id="source" name="source" defaultValue={lead.source} className={CONTROL}>
                  {CRM_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {t(`source_${s}` as 'source_outro')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="investor_profile" className={LABEL}>
                  {t('investorProfile')}
                </Label>
                <select
                  id="investor_profile"
                  name="investor_profile"
                  defaultValue={lead.investor_profile ?? ''}
                  className={CONTROL}
                >
                  <option value="">{t('noProfile')}</option>
                  {CRM_PROFILES.map((p) => (
                    <option key={p} value={p}>
                      {t(`profile_${p}` as 'profile_retail')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimated_ticket" className={LABEL}>
                  {t('estimatedTicket')}
                </Label>
                <Input
                  id="estimated_ticket"
                  name="estimated_ticket"
                  type="number"
                  min={0}
                  step="1000"
                  defaultValue={lead.estimated_ticket ?? ''}
                />
                {lead.estimated_ticket != null && (
                  <p className="text-xs text-ink-muted tabular-nums">
                    {eur(lead.estimated_ticket)}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags" className={LABEL}>
                  {t('tags')}
                </Label>
                <Input
                  id="tags"
                  name="tags"
                  defaultValue={lead.tags.join(', ')}
                  placeholder={t('tagsHint')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes" className={LABEL}>
                  {t('notes')}
                </Label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  defaultValue={lead.notes}
                  className={`${CONTROL} h-auto py-2.5`}
                />
              </div>
              <Button type="submit" size="sm">
                {t('save')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
