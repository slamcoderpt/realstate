import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

/**
 * CRM de investidores (server-only, service role). Escrita só por aqui, chamada
 * por Server Actions que garantem staff. A RLS das tabelas é staff-lê; a escrita
 * nunca passa por RLS (service role).
 */

export type CrmStage =
  | 'novo'
  | 'contactado'
  | 'qualificado'
  | 'reuniao'
  | 'convite_enviado'
  | 'convertido'
  | 'perdido';

// Ordem das colunas do kanban (a mesma da apresentação).
export const CRM_STAGES: CrmStage[] = [
  'novo',
  'contactado',
  'qualificado',
  'reuniao',
  'convite_enviado',
  'convertido',
  'perdido'
];

export type CrmSource =
  | 'referencia'
  | 'evento'
  | 'website'
  | 'linkedin'
  | 'outro';
export const CRM_SOURCES: CrmSource[] = [
  'referencia',
  'evento',
  'website',
  'linkedin',
  'outro'
];

export type CrmInvestorProfile = 'retail' | 'qualificado' | 'institucional';
export const CRM_PROFILES: CrmInvestorProfile[] = [
  'retail',
  'qualificado',
  'institucional'
];

export type CrmActivityType =
  | 'nota'
  | 'chamada'
  | 'email'
  | 'reuniao'
  | 'mudanca_estado';

export type LeadRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  source: CrmSource;
  stage: CrmStage;
  owner_id: string | null;
  investor_profile: CrmInvestorProfile | null;
  estimated_ticket: number | null;
  notes: string;
  tags: string[];
  last_activity_at: string;
  created_at: string;
};

export type ActivityRow = {
  id: string;
  lead_id: string;
  author_id: string | null;
  type: CrmActivityType;
  body: string;
  due_at: string | null;
  done: boolean;
  created_at: string;
};

const LEAD_COLUMNS =
  'id, full_name, email, phone, source, stage, owner_id, investor_profile, estimated_ticket, notes, tags, last_activity_at, created_at';

function toLead(raw: Record<string, unknown>): LeadRow {
  return {
    ...(raw as LeadRow),
    estimated_ticket:
      raw.estimated_ticket == null ? null : Number(raw.estimated_ticket)
  };
}

export type CreateLeadInput = {
  fullName: string;
  email: string;
  phone?: string;
  source?: CrmSource;
  ownerId?: string | null;
  investorProfile?: CrmInvestorProfile | null;
  estimatedTicket?: number | null;
  notes?: string;
  createdBy: string;
};

export async function createLead(
  input: CreateLeadInput,
  db: SupabaseClient = createAdminClient()
): Promise<{id: string}> {
  const {data, error} = await db
    .from('crm_leads')
    .insert({
      full_name: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: (input.phone ?? '').trim(),
      source: input.source ?? 'outro',
      owner_id: input.ownerId ?? input.createdBy,
      investor_profile: input.investorProfile ?? null,
      estimated_ticket: input.estimatedTicket ?? null,
      notes: input.notes ?? '',
      created_by: input.createdBy
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`criar lead falhou: ${error?.message ?? 'sem linha'}`);
  }
  return {id: data.id};
}

export type UpdateLeadInput = {
  fullName?: string;
  email?: string;
  phone?: string;
  source?: CrmSource;
  ownerId?: string | null;
  investorProfile?: CrmInvestorProfile | null;
  estimatedTicket?: number | null;
  notes?: string;
};

export async function updateLead(
  id: string,
  input: UpdateLeadInput,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const patch: Record<string, unknown> = {updated_at: new Date().toISOString()};
  if (input.fullName !== undefined) patch.full_name = input.fullName.trim();
  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase();
  if (input.phone !== undefined) patch.phone = input.phone.trim();
  if (input.source !== undefined) patch.source = input.source;
  if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
  if (input.investorProfile !== undefined)
    patch.investor_profile = input.investorProfile;
  if (input.estimatedTicket !== undefined)
    patch.estimated_ticket = input.estimatedTicket;
  if (input.notes !== undefined) patch.notes = input.notes;
  const {error} = await db.from('crm_leads').update(patch).eq('id', id);
  if (error) throw new Error(`atualizar lead falhou: ${error.message}`);
}

/**
 * Move um lead de estado e regista automaticamente a mudança na timeline — é
 * este registo que mantém o histórico completo ("não perder informação").
 */
export async function moveLeadStage(
  id: string,
  to: CrmStage,
  actorId: string,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {data: cur} = await db
    .from('crm_leads')
    .select('stage')
    .eq('id', id)
    .single();
  if (!cur) throw new Error(`lead ${id} não encontrado`);
  if (cur.stage === to) return; // no-op: arrastar para a mesma coluna

  const now = new Date().toISOString();
  const {error} = await db
    .from('crm_leads')
    .update({stage: to, updated_at: now, last_activity_at: now})
    .eq('id', id);
  if (error) throw new Error(`mover lead falhou: ${error.message}`);

  await db.from('crm_activities').insert({
    lead_id: id,
    author_id: actorId,
    type: 'mudanca_estado',
    body: `${cur.stage} → ${to}`
  });
}

export type AddActivityInput = {
  type: CrmActivityType;
  body?: string;
  dueAt?: string | null;
};

export async function addActivity(
  leadId: string,
  input: AddActivityInput,
  authorId: string,
  db: SupabaseClient = createAdminClient()
): Promise<{id: string}> {
  const {data, error} = await db
    .from('crm_activities')
    .insert({
      lead_id: leadId,
      author_id: authorId,
      type: input.type,
      body: (input.body ?? '').trim(),
      due_at: input.dueAt ?? null
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`registar atividade falhou: ${error?.message ?? 'sem linha'}`);
  }
  // A atividade é o sinal de vida do lead: atualiza o carimbo para o kanban
  // poder mostrar "há X dias sem contacto".
  await db
    .from('crm_leads')
    .update({last_activity_at: new Date().toISOString()})
    .eq('id', leadId);
  return {id: data.id};
}

export async function listLeads(
  db: SupabaseClient = createAdminClient()
): Promise<LeadRow[]> {
  const {data, error} = await db
    .from('crm_leads')
    .select(LEAD_COLUMNS)
    .order('last_activity_at', {ascending: false});
  if (error) throw new Error(`listar leads falhou: ${error.message}`);
  return (data ?? []).map((r) => toLead(r as Record<string, unknown>));
}

export type LeadDetail = {lead: LeadRow; activities: ActivityRow[]};

export async function getLeadDetail(
  id: string,
  db: SupabaseClient = createAdminClient()
): Promise<LeadDetail | null> {
  const {data: lead} = await db
    .from('crm_leads')
    .select(LEAD_COLUMNS)
    .eq('id', id)
    .single();
  if (!lead) return null;
  const {data: activities} = await db
    .from('crm_activities')
    .select('id, lead_id, author_id, type, body, due_at, done, created_at')
    .eq('lead_id', id)
    .order('created_at', {ascending: false});
  return {
    lead: toLead(lead as Record<string, unknown>),
    activities: (activities ?? []) as ActivityRow[]
  };
}
