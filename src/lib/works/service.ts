import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';
import {notifyConfirmedInvestors} from '@/lib/notify/investors';

/**
 * Acompanhamento de obra (server-only, service role). Escrita só por aqui,
 * chamada por Server Actions que garantem staff.
 */

export type MilestoneStatus = 'previsto' | 'em_curso' | 'concluido';

export type MilestoneRow = {
  id: string;
  project_id: string;
  title: string;
  planned_date: string | null;
  actual_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
};

export type WorkUpdateRow = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  body: string;
  published_at: string;
};

export type MediaRow = {
  id: string;
  work_update_id: string;
  media_type: 'photo' | 'video';
  mime_type: string;
  sort_order: number;
};

export async function addMilestone(
  projectId: string,
  input: {title: string; plannedDate?: string | null},
  db: SupabaseClient = createAdminClient()
): Promise<{id: string}> {
  const {count} = await db
    .from('project_milestones')
    .select('*', {count: 'exact', head: true})
    .eq('project_id', projectId);
  const {data, error} = await db
    .from('project_milestones')
    .insert({
      project_id: projectId,
      title: input.title.trim(),
      planned_date: input.plannedDate ?? null,
      sort_order: (count ?? 0) + 1
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`criar marco falhou: ${error?.message ?? 'sem linha'}`);
  }
  return {id: data.id};
}

export async function updateMilestone(
  id: string,
  input: {
    title?: string;
    plannedDate?: string | null;
    actualDate?: string | null;
    status?: MilestoneStatus;
  },
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.plannedDate !== undefined) patch.planned_date = input.plannedDate;
  if (input.actualDate !== undefined) patch.actual_date = input.actualDate;
  if (input.status !== undefined) patch.status = input.status;
  const {error} = await db.from('project_milestones').update(patch).eq('id', id);
  if (error) throw new Error(`atualizar marco falhou: ${error.message}`);
}

export async function listMilestones(
  projectId: string,
  db: SupabaseClient = createAdminClient()
): Promise<MilestoneRow[]> {
  const {data, error} = await db
    .from('project_milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', {ascending: true});
  if (error) throw new Error(`listar marcos falhou: ${error.message}`);
  return (data ?? []) as MilestoneRow[];
}

export type PublishUpdateInput = {
  projectId: string;
  title: string;
  body: string;
  milestoneId?: string | null;
  createdBy: string;
  locale: Locale;
};

export async function publishWorkUpdate(
  input: PublishUpdateInput,
  deps: SendEmailDeps = {}
): Promise<{id: string}> {
  const db = deps.db ?? createAdminClient();
  const {data: project} = await db
    .from('projects')
    .select('name')
    .eq('id', input.projectId)
    .single();
  if (!project) throw new Error('projeto não encontrado');

  const {data, error} = await db
    .from('work_updates')
    .insert({
      project_id: input.projectId,
      milestone_id: input.milestoneId ?? null,
      title: input.title.trim(),
      body: input.body,
      created_by: input.createdBy
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`publicar atualização falhou: ${error?.message ?? 'sem linha'}`);
  }

  await notifyConfirmedInvestors(
    db,
    input.projectId,
    'work_update_published',
    {projectName: project.name, updateTitle: input.title.trim()},
    input.locale,
    {transport: deps.transport}
  );

  return {id: data.id};
}

export async function listWorkUpdates(
  projectId: string,
  db: SupabaseClient = createAdminClient()
): Promise<WorkUpdateRow[]> {
  const {data, error} = await db
    .from('work_updates')
    .select('*')
    .eq('project_id', projectId)
    .order('published_at', {ascending: false});
  if (error) throw new Error(`listar atualizações falhou: ${error.message}`);
  return (data ?? []) as WorkUpdateRow[];
}

export async function listUpdateMedia(
  updateIds: string[],
  db: SupabaseClient = createAdminClient()
): Promise<MediaRow[]> {
  if (updateIds.length === 0) return [];
  const {data, error} = await db
    .from('work_update_media')
    .select('id, work_update_id, media_type, mime_type, sort_order')
    .in('work_update_id', updateIds)
    .order('sort_order', {ascending: true});
  if (error) throw new Error(`listar media falhou: ${error.message}`);
  return (data ?? []) as MediaRow[];
}

/**
 * Grava o custo real de uma rubrica e dispara alerta INTERNO ao staff se o
 * desvio exceder `budget_deviation_alert_pct` (spec 3.5). Só dispara em
 * DERRAPAGEM (desvio positivo) — gastar abaixo do orçamento não é alarme.
 */
export async function setActualAmount(
  lineId: string,
  actual: number,
  opts: {locale: Locale},
  deps: SendEmailDeps = {}
): Promise<void> {
  const db = deps.db ?? createAdminClient();
  const {data: line} = await db
    .from('project_budget_lines')
    .select('name, budget_amount, project_id')
    .eq('id', lineId)
    .single();
  if (!line) throw new Error('rubrica não encontrada');

  const {error} = await db
    .from('project_budget_lines')
    .update({actual_amount: actual})
    .eq('id', lineId);
  if (error) throw new Error(`gravar custo real falhou: ${error.message}`);

  const budget = Number(line.budget_amount);
  if (budget <= 0) return;

  const threshold = (await settingNumber(db, 'budget_deviation_alert_pct')) ?? 10;
  const deviationPct = ((actual - budget) / budget) * 100;

  if (deviationPct > threshold) {
    await sendEmail(
      {
        toEmail: staffNotifyEmail(),
        locale: opts.locale,
        template: 'budget_deviation_alert',
        payload: {
          lineName: line.name,
          budget: formatEur(budget),
          actual: formatEur(actual),
          deviationPct: deviationPct.toFixed(1)
        }
      },
      {db, transport: deps.transport}
    );
  }
}

// --- helpers ---

/**
 * Lê um `platform_settings` numérico. Devolve null se a chave não existir, se
 * o valor for jsonb `null` ou se não for um número — o chamador aplica o seu
 * próprio default. Mesma forma do helper em lib/subscriptions/service.ts.
 */
async function settingNumber(
  db: SupabaseClient,
  key: string
): Promise<number | null> {
  const {data} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  const v = data?.value;
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function staffNotifyEmail(): string {
  return process.env.SMTP_USER ?? 'staff@tilweni.local';
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(n);
}
