import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {computeIndicators, type Indicators} from './indicators';
import {canTransition, type ProjectStatus} from './states';

/**
 * Lógica de projetos (server-only, service role). Escrita só por aqui, chamada
 * por Server Actions que garantem staff. RLS das tabelas é investidor-lê-
 * subscricao + staff-lê-tudo; a escrita nunca passa por RLS (service role).
 */

export type CreateProjectInput = {
  name: string;
  location: string;
  description: string;
  acquisitionCost: number;
  worksBudget: number;
  arv: number;
  totalAmount: number;
  estimatedIrr: number;
  termMonths: number;
};

export type ProjectRow = {
  id: string;
  name: string;
  location: string;
  description: string;
  status: ProjectStatus;
  acquisition_cost: number;
  works_budget: number;
  arv: number;
  total_amount: number;
  subscribed_amount: number;
  investor_count: number;
  estimated_irr: number;
  term_months: number;
  cover_path: string | null;
  published_at: string | null;
};

export type BudgetLineRow = {
  id: string;
  name: string;
  phase: string;
  budget_amount: number;
  sort_order: number;
};

export type PhotoRow = {id: string; storage_path: string; sort_order: number};
export type DocRow = {
  id: string;
  doc_type: string;
  original_filename: string;
};

export type ProjectDetail = {
  project: ProjectRow;
  budgetLines: BudgetLineRow[];
  photos: PhotoRow[];
  documents: DocRow[];
  indicators: Indicators;
};

// PostgREST serializa `numeric` de forma diferente conforme a versão/config
// (string vs número JS). Normalizamos SEMPRE para número no serviço, para que o
// comportamento seja idêntico no stack local e na cloud (versões distintas de
// Supabase). `Number(...)` é no-op sobre um número e faz parse de uma string.
function toProjectRow(raw: Record<string, unknown>): ProjectRow {
  return {
    ...(raw as ProjectRow),
    acquisition_cost: Number(raw.acquisition_cost),
    works_budget: Number(raw.works_budget),
    arv: Number(raw.arv),
    total_amount: Number(raw.total_amount),
    subscribed_amount: Number(raw.subscribed_amount),
    estimated_irr: Number(raw.estimated_irr)
  };
}

function toBudgetLineRow(raw: Record<string, unknown>): BudgetLineRow {
  return {...(raw as BudgetLineRow), budget_amount: Number(raw.budget_amount)};
}

function toCatalogueRow(raw: Record<string, unknown>): CatalogueRow {
  return {
    ...(raw as CatalogueRow),
    total_amount: Number(raw.total_amount),
    subscribed_amount: Number(raw.subscribed_amount),
    estimated_irr: Number(raw.estimated_irr)
  };
}

export async function createProject(
  input: CreateProjectInput,
  db: SupabaseClient = createAdminClient()
): Promise<{id: string}> {
  const {data, error} = await db
    .from('projects')
    .insert({
      name: input.name.trim(),
      location: input.location.trim(),
      description: input.description,
      acquisition_cost: input.acquisitionCost,
      works_budget: input.worksBudget,
      arv: input.arv,
      total_amount: input.totalAmount,
      estimated_irr: input.estimatedIrr,
      term_months: input.termMonths
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`criar projeto falhou: ${error?.message ?? 'sem linha'}`);
  }
  return {id: data.id};
}

export async function updateProject(
  id: string,
  input: Partial<CreateProjectInput>,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const patch: Record<string, unknown> = {updated_at: new Date().toISOString()};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.location !== undefined) patch.location = input.location.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.acquisitionCost !== undefined)
    patch.acquisition_cost = input.acquisitionCost;
  if (input.worksBudget !== undefined) patch.works_budget = input.worksBudget;
  if (input.arv !== undefined) patch.arv = input.arv;
  if (input.totalAmount !== undefined) patch.total_amount = input.totalAmount;
  if (input.estimatedIrr !== undefined) patch.estimated_irr = input.estimatedIrr;
  if (input.termMonths !== undefined) patch.term_months = input.termMonths;

  const {error} = await db.from('projects').update(patch).eq('id', id);
  if (error) throw new Error(`atualizar projeto falhou: ${error.message}`);
}

export async function transitionProject(
  id: string,
  to: ProjectStatus,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {data: cur, error: readError} = await db
    .from('projects')
    .select('status')
    .eq('id', id)
    .single();
  if (readError || !cur) throw new Error(`projeto ${id} não encontrado`);
  if (!canTransition(cur.status as ProjectStatus, to)) {
    throw new Error(`transição inválida: ${cur.status} → ${to}`);
  }
  const patch: Record<string, unknown> = {
    status: to,
    updated_at: new Date().toISOString()
  };
  if (to === 'subscricao') patch.published_at = new Date().toISOString();
  const {error} = await db.from('projects').update(patch).eq('id', id);
  if (error) throw new Error(`mudar estado falhou: ${error.message}`);
}

export async function addBudgetLine(
  projectId: string,
  input: {name: string; phase: string; budgetAmount: number},
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {count} = await db
    .from('project_budget_lines')
    .select('*', {count: 'exact', head: true})
    .eq('project_id', projectId);
  const {error} = await db.from('project_budget_lines').insert({
    project_id: projectId,
    name: input.name.trim(),
    phase: input.phase.trim(),
    budget_amount: input.budgetAmount,
    sort_order: (count ?? 0) + 1
  });
  if (error) throw new Error(`adicionar rubrica falhou: ${error.message}`);
}

export type CatalogueRow = {
  id: string;
  name: string;
  location: string;
  status: ProjectStatus;
  total_amount: number;
  subscribed_amount: number;
  investor_count: number;
  estimated_irr: number;
  term_months: number;
  cover_path: string | null;
};

export async function listCatalogue(
  db: SupabaseClient = createAdminClient()
): Promise<CatalogueRow[]> {
  const {data, error} = await db
    .from('projects')
    .select(
      'id, name, location, status, total_amount, subscribed_amount, investor_count, estimated_irr, term_months, cover_path'
    )
    .eq('status', 'subscricao')
    .order('published_at', {ascending: false});
  if (error) throw new Error(`listar catálogo falhou: ${error.message}`);
  return (data ?? []).map((r) => toCatalogueRow(r as Record<string, unknown>));
}

export async function listAllProjects(
  db: SupabaseClient = createAdminClient()
): Promise<ProjectRow[]> {
  const {data, error} = await db
    .from('projects')
    .select('*')
    .order('created_at', {ascending: false});
  if (error) throw new Error(`listar projetos falhou: ${error.message}`);
  return (data ?? []).map((r) => toProjectRow(r as Record<string, unknown>));
}

export async function getProjectDetail(
  id: string,
  opts: {staff: boolean},
  db: SupabaseClient = createAdminClient()
): Promise<ProjectDetail | null> {
  const {data: project} = await db
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();
  if (!project) return null;
  // Investidor só acede a projetos em subscricao (a RLS já protege as leituras
  // de investidor; aqui, chamado com service role, aplicamos a mesma regra).
  if (!opts.staff && project.status !== 'subscricao') return null;

  const {data: rawBudgetLines} = await db
    .from('project_budget_lines')
    .select('id, name, phase, budget_amount, sort_order')
    .eq('project_id', id)
    .order('sort_order', {ascending: true});
  const {data: photos} = await db
    .from('project_photos')
    .select('id, storage_path, sort_order')
    .eq('project_id', id)
    .order('sort_order', {ascending: true});
  const {data: documents} = await db
    .from('project_documents')
    .select('id, doc_type, original_filename')
    .eq('project_id', id);

  const projectRow = toProjectRow(project as Record<string, unknown>);
  const budgetLines = (rawBudgetLines ?? []).map((b) =>
    toBudgetLineRow(b as Record<string, unknown>)
  );

  const indicators = computeIndicators({
    acquisitionCost: projectRow.acquisition_cost,
    worksBudget: projectRow.works_budget,
    arv: projectRow.arv
  });

  return {
    project: projectRow,
    budgetLines,
    photos: (photos ?? []) as PhotoRow[],
    documents: (documents ?? []) as DocRow[],
    indicators
  };
}
