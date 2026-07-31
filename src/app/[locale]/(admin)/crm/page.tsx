import {getTranslations} from 'next-intl/server';
import {AlertTriangleIcon, CalendarClockIcon, CheckIcon} from 'lucide-react';
import {createAdminClient} from '@/lib/supabase/admin';
import {
  listLeads,
  listPendingFollowups,
  CRM_STAGES,
  type LeadRow
} from '@/lib/crm/service';
import {Button} from '@/components/ui/button';
import type {Locale} from '@/lib/mail/templates';
import {KanbanBoard, type LeadCard} from './KanbanBoard';
import {NewLeadForm} from './NewLeadForm';
import {markFollowupDoneAction} from './actions';

export const dynamic = 'force-dynamic';

const DAY_MS = 1000 * 60 * 60 * 24;

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

// Estados "abertos" (o lead ainda está no funil de angariação) — o valor do
// pipeline soma só estes; convertido/perdido saem da conta.
const OPEN_STAGES = new Set(['novo', 'contactado', 'qualificado', 'reuniao', 'convite_enviado']);

export default async function CrmPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const t = await getTranslations('Crm');

  const [leads, followups] = await Promise.all([
    listLeads(),
    listPendingFollowups()
  ]);

  // Nomes dos responsáveis (um fetch).
  const ownerIds = [
    ...new Set(leads.map((l) => l.owner_id).filter((v): v is string => !!v))
  ];
  const ownerName = new Map<string, string>();
  if (ownerIds.length > 0) {
    const db = createAdminClient();
    const {data} = await db
      .from('profiles')
      .select('id, full_name')
      .in('id', ownerIds);
    for (const p of data ?? [])
      ownerName.set(p.id as string, (p.full_name as string) || '');
  }

  const now = Date.now();
  const toCard = (l: LeadRow): LeadCard => ({
    id: l.id,
    fullName: l.full_name,
    estimatedTicket: l.estimated_ticket,
    ownerName: l.owner_id ? (ownerName.get(l.owner_id) ?? '') : '',
    source: l.source,
    agentName: l.agent_name,
    tags: l.tags,
    daysSinceContact: Math.floor(
      (now - new Date(l.last_activity_at).getTime()) / DAY_MS
    )
  });

  const columns = CRM_STAGES.map((stage) => ({
    stage,
    label: t(`stage_${stage}` as 'stage_novo'),
    leads: leads.filter((l) => l.stage === stage).map(toCard)
  }));

  // Métricas de topo.
  const pipelineValue = leads
    .filter((l) => OPEN_STAGES.has(l.stage))
    .reduce((sum, l) => sum + (l.estimated_ticket ?? 0), 0);
  const convertedCount = leads.filter((l) => l.stage === 'convertido').length;

  // Follow-ups: separar atrasados (data já passou) dos próximos.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const fmtDate = (v: string) =>
    new Intl.DateTimeFormat(loc === 'en' ? 'en-GB' : 'pt-PT', {
      dateStyle: 'medium'
    }).format(new Date(v));

  return (
    <main className="mx-auto max-w-[100rem] space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">
            {t('title')}
          </h1>
          <p className="text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        <NewLeadForm locale={loc} />
      </header>

      {/* Métricas rápidas do pipeline. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t('metricLeads')} value={String(leads.length)} />
        <Metric label={t('metricPipeline')} value={eur(pipelineValue)} />
        <Metric label={t('metricConverted')} value={String(convertedCount)} />
        <Metric
          label={t('metricFollowups')}
          value={String(followups.length)}
        />
      </section>

      {/* Painel de follow-ups por resolver. */}
      {followups.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-tight text-ink">
            <CalendarClockIcon aria-hidden className="size-4 text-brand-500" />
            {t('followupsTitle')}
          </h2>
          <ul className="divide-y divide-border">
            {followups.map((f) => {
              const overdue = new Date(f.dueAt).getTime() < todayMs;
              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm"
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                      overdue
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-brand-50 text-brand-700'
                    }`}
                  >
                    {overdue && <AlertTriangleIcon aria-hidden className="size-3" />}
                    {fmtDate(f.dueAt)}
                  </span>
                  <a
                    href={`/${locale}/crm/${f.leadId}`}
                    className="font-semibold text-ink underline-offset-4 hover:text-brand-600 hover:underline"
                  >
                    {f.leadName}
                  </a>
                  <span className="min-w-0 flex-1 truncate text-ink-muted">
                    {t(`type_${f.type}` as 'type_nota')}
                    {f.body ? ` · ${f.body}` : ''}
                  </span>
                  <form action={markFollowupDoneAction.bind(null, loc, f.id)}>
                    <Button type="submit" variant="outline" size="sm">
                      <CheckIcon aria-hidden className="size-4" />
                      {t('markDone')}
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {leads.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-card px-6 py-14 text-center text-sm text-ink-muted shadow-[var(--shadow-card)]">
          {t('emptyBoard')}
        </div>
      ) : (
        <KanbanBoard locale={loc} columns={columns} />
      )}
    </main>
  );
}

function Metric({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="text-[0.6875rem] font-bold tracking-[0.1em] text-ink-muted uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink tabular-nums">
        {value}
      </p>
    </div>
  );
}
