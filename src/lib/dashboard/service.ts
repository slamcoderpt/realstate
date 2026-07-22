import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

/**
 * Área do investidor (spec 5.7): posições próprias, marcos, atualizações de
 * obra e extratos recentes.
 *
 * Corre com service role, que BYPASSA a RLS — logo as regras de visibilidade
 * vivem aqui, em código, e têm de espelhar exatamente as políticas da BD:
 *
 *  - obra (marcos + atualizações): qualquer subscrição ativa
 *    (`has_active_subscription`);
 *  - extratos da conta dedicada: só `fundos_confirmados`
 *    (`has_confirmed_subscription`).
 *
 * A assimetria é deliberada e NÃO deve ser unificada: acompanhar a obra é
 * informação do projeto; o extrato é o registo financeiro da conta que detém o
 * dinheiro dos investidores.
 *
 * Tudo é estritamente na primeira pessoa — nada agregado sobre outros
 * investidores (anti-crowdfunding: sem contagens, sem barras, sem histórico).
 */

/** Quantas linhas mostrar em cada feed da área do investidor. */
const FEED_LIMIT = 5;

export type DashboardData = {
  investedTotal: number;
  positions: Array<{
    projectId: string;
    projectName: string;
    projectStatus: string;
    amount: number;
    status: string;
    estimatedIrr: number;
  }>;
  upcomingMilestones: Array<{
    projectId: string;
    projectName: string;
    title: string;
    plannedDate: string;
  }>;
  latestUpdates: Array<{
    projectId: string;
    projectName: string;
    title: string;
    publishedAt: string;
  }>;
  recentStatements: Array<{
    id: string;
    projectId: string;
    projectName: string;
    period: string;
    publishedAt: string;
  }>;
};

const EMPTY: DashboardData = {
  investedTotal: 0,
  positions: [],
  upcomingMilestones: [],
  latestUpdates: [],
  recentStatements: []
};

type SubscriptionWithProject = {
  project_id: string;
  amount: number | string;
  status: string;
  projects: {
    name: string;
    status: string;
    estimated_irr: number | string;
  } | null;
};

export async function getInvestorDashboard(
  userId: string,
  db: SupabaseClient = createAdminClient()
): Promise<DashboardData> {
  // Uma query para as posições (projeto embebido) e uma por feed — não N+1.
  const {data: subs, error} = await db
    .from('subscriptions')
    .select('project_id, amount, status, projects (name, status, estimated_irr)')
    .eq('user_id', userId)
    .neq('status', 'cancelada')
    .order('created_at', {ascending: true});
  if (error) throw new Error(`ler posições falhou: ${error.message}`);

  const rows = (subs ?? []) as unknown as SubscriptionWithProject[];
  if (rows.length === 0) return {...EMPTY};

  const positions = rows.map((r) => ({
    projectId: r.project_id,
    projectName: r.projects?.name ?? '',
    projectStatus: r.projects?.status ?? '',
    // `numeric` chega como string do PostgREST — normalizar aqui, não na UI.
    amount: Number(r.amount),
    status: r.status,
    estimatedIrr: Number(r.projects?.estimated_irr ?? 0)
  }));

  const investedTotal = positions
    .filter((p) => p.status === 'fundos_confirmados')
    .reduce((sum, p) => sum + p.amount, 0);

  const projectName = new Map(positions.map((p) => [p.projectId, p.projectName]));
  const activeIds = positions.map((p) => p.projectId);
  const confirmedIds = positions
    .filter((p) => p.status === 'fundos_confirmados')
    .map((p) => p.projectId);

  const [milestones, updates, statements] = await Promise.all([
    listUpcomingMilestones(db, activeIds),
    listLatestUpdates(db, activeIds),
    listRecentStatements(db, confirmedIds)
  ]);

  return {
    investedTotal,
    positions,
    upcomingMilestones: milestones.map((m) => ({
      projectId: m.project_id,
      projectName: projectName.get(m.project_id) ?? '',
      title: m.title,
      plannedDate: m.planned_date ?? ''
    })),
    latestUpdates: updates.map((u) => ({
      projectId: u.project_id,
      projectName: projectName.get(u.project_id) ?? '',
      title: u.title,
      publishedAt: u.published_at
    })),
    recentStatements: statements.map((s) => ({
      id: s.id,
      projectId: s.project_id,
      projectName: projectName.get(s.project_id) ?? '',
      period: s.period,
      publishedAt: s.published_at
    }))
  };
}

// --- feeds ---

type MilestoneRow = {project_id: string; title: string; planned_date: string | null};
type UpdateRow = {project_id: string; title: string; published_at: string};
type StatementRow = {
  id: string;
  project_id: string;
  period: string;
  published_at: string;
};

async function listUpcomingMilestones(
  db: SupabaseClient,
  projectIds: string[]
): Promise<MilestoneRow[]> {
  if (projectIds.length === 0) return [];
  const {data, error} = await db
    .from('project_milestones')
    .select('project_id, title, planned_date')
    .in('project_id', projectIds)
    .neq('status', 'concluido')
    .order('planned_date', {ascending: true, nullsFirst: false})
    .limit(FEED_LIMIT);
  if (error) throw new Error(`ler marcos falhou: ${error.message}`);
  return (data ?? []) as MilestoneRow[];
}

async function listLatestUpdates(
  db: SupabaseClient,
  projectIds: string[]
): Promise<UpdateRow[]> {
  if (projectIds.length === 0) return [];
  const {data, error} = await db
    .from('work_updates')
    .select('project_id, title, published_at')
    .in('project_id', projectIds)
    .order('published_at', {ascending: false})
    .limit(FEED_LIMIT);
  if (error) throw new Error(`ler atualizações falhou: ${error.message}`);
  return (data ?? []) as UpdateRow[];
}

/**
 * `projectIds` são só os projetos com FUNDOS CONFIRMADOS — nunca a lista de
 * posições ativas. Ver a nota no topo do ficheiro.
 */
async function listRecentStatements(
  db: SupabaseClient,
  projectIds: string[]
): Promise<StatementRow[]> {
  if (projectIds.length === 0) return [];
  const {data, error} = await db
    .from('account_statements')
    .select('id, project_id, period, published_at')
    .in('project_id', projectIds)
    .order('published_at', {ascending: false})
    .limit(FEED_LIMIT);
  if (error) throw new Error(`ler extratos falhou: ${error.message}`);
  return (data ?? []) as StatementRow[];
}
