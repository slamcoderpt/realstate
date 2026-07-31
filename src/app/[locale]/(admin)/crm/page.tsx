import {getTranslations} from 'next-intl/server';
import {AlertTriangleIcon, CheckIcon} from 'lucide-react';
import {createAdminClient} from '@/lib/supabase/admin';
import {
  listLeads,
  listPendingFollowups,
  CRM_STAGES,
  type LeadRow
} from '@/lib/crm/service';
import type {Locale} from '@/lib/mail/templates';
import {CrmWorkspace} from './CrmWorkspace';
import {NewLeadForm} from './NewLeadForm';
import {markFollowupDoneAction} from './actions';
import {PANEL, SECTION_TITLE, eur} from './ui';
import type {LeadCard} from './types';

export const dynamic = 'force-dynamic';

const DAY_MS = 1000 * 60 * 60 * 24;

// Estados "abertos" (o lead ainda está no funil de angariação) — o valor do
// pipeline soma só estes; convertido/perdido saem da conta.
const OPEN_STAGES = new Set([
  'novo',
  'contactado',
  'qualificado',
  'reuniao',
  'convite_enviado'
]);

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
    email: l.email,
    stage: l.stage,
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
    <main className="mx-auto max-w-[110rem] space-y-4 px-5 py-5">
      {/* Cabeçalho numa só linha: título, métricas e a ação primária. Um bloco
          de topo alto empurrava o pipeline para fora do ecrã — e o pipeline é
          a página. */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold tracking-tight text-[var(--crm-gray12)]">
            {t('title')}
          </h1>
          <p className="text-[12px] text-[var(--crm-gray9)]">{t('subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Metric label={t('metricLeads')} value={String(leads.length)} />
          <Metric label={t('metricPipeline')} value={eur(pipelineValue)} />
          <Metric label={t('metricConverted')} value={String(convertedCount)} />
          <Metric
            label={t('metricFollowups')}
            value={String(followups.length)}
          />
        </div>

        <div className="ml-auto">
          <NewLeadForm locale={loc} />
        </div>
      </header>

      {/* Painel de follow-ups por resolver. */}
      {followups.length > 0 && (
        <section className={`${PANEL} px-4 py-3`}>
          <h2 className={`${SECTION_TITLE} mb-2`}>{t('followupsTitle')}</h2>
          <ul className="divide-y divide-[var(--crm-gray4)]">
            {followups.map((f) => {
              const overdue = new Date(f.dueAt).getTime() < todayMs;
              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[13px]"
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium tabular-nums ${
                      overdue
                        ? 'bg-[#ffefef] text-[#ce2c31]'
                        : 'bg-[#f0f0f0] text-[#646464]'
                    }`}
                  >
                    {overdue && (
                      <AlertTriangleIcon aria-hidden className="size-3" />
                    )}
                    {fmtDate(f.dueAt)}
                  </span>
                  <a
                    href={`/${locale}/crm/${f.leadId}`}
                    className="font-medium text-[var(--crm-gray12)] underline-offset-2 hover:underline"
                  >
                    {f.leadName}
                  </a>
                  <span className="min-w-0 flex-1 truncate text-[var(--crm-gray9)]">
                    {t(`type_${f.type}` as 'type_nota')}
                    {f.body ? ` · ${f.body}` : ''}
                  </span>
                  <form action={markFollowupDoneAction.bind(null, loc, f.id)}>
                    <button
                      type="submit"
                      className="inline-flex h-7 items-center gap-1 rounded border border-[var(--crm-gray6)] bg-white px-2 text-[12px] font-medium text-[var(--crm-gray11)] transition-colors hover:bg-[var(--crm-gray4)] hover:text-[var(--crm-gray12)]"
                    >
                      <CheckIcon aria-hidden className="size-3.5" />
                      {t('markDone')}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {leads.length === 0 ? (
        <div className={`${PANEL} px-6 py-16 text-center text-[13px] text-[var(--crm-gray9)]`}>
          {t('emptyBoard')}
        </div>
      ) : (
        <CrmWorkspace locale={loc} columns={columns} />
      )}
    </main>
  );
}

/** Métrica inline: valor em cima, rótulo pequeno por baixo. Sem caixa — são
 *  contexto do cabeçalho, não cartões para clicar. */
function Metric({label, value}: {label: string; value: string}) {
  return (
    <div>
      <p className="text-[15px] font-semibold text-[var(--crm-gray12)] tabular-nums">
        {value}
      </p>
      <p className="text-[11px] text-[var(--crm-gray9)]">{label}</p>
    </div>
  );
}
