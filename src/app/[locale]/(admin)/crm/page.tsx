import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {listLeads, CRM_STAGES, type LeadRow} from '@/lib/crm/service';
import type {Locale} from '@/lib/mail/templates';
import {KanbanBoard, type LeadCard} from './KanbanBoard';
import {NewLeadForm} from './NewLeadForm';

export const dynamic = 'force-dynamic';

const DAY_MS = 1000 * 60 * 60 * 24;

export default async function CrmPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const t = await getTranslations('Crm');

  const leads = await listLeads();

  // Resolve os nomes dos responsáveis num único fetch (evita N+1).
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
    daysSinceContact: Math.floor(
      (now - new Date(l.last_activity_at).getTime()) / DAY_MS
    )
  });

  const columns = CRM_STAGES.map((stage) => ({
    stage,
    label: t(`stage_${stage}` as 'stage_novo'),
    leads: leads.filter((l) => l.stage === stage).map(toCard)
  }));

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
