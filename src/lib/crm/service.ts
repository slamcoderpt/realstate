import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {createInvite} from '@/lib/invites/service';
import type {SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';

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
  converted_invite_id: string | null;
  converted_user_id: string | null;
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
  'id, full_name, email, phone, source, stage, owner_id, investor_profile, estimated_ticket, notes, tags, converted_invite_id, converted_user_id, last_activity_at, created_at';

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
  tags?: string[];
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
  if (input.tags !== undefined) patch.tags = input.tags;
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

// --- conversão em convite (Fatia B) ---

const USERS_PER_PAGE = 1000;

/**
 * Procura um utilizador pelo email percorrendo TODAS as páginas de
 * `auth.admin.listUsers` (a API é paginada — ler só a 1ª truncava). Mesmo padrão
 * de `lib/auth/password-reset.ts`.
 */
async function findUserByEmail(
  db: SupabaseClient,
  email: string
): Promise<{id: string} | null> {
  const target = email.trim().toLowerCase();
  let found: {id: string} | null = null;
  for (let page = 1; ; page++) {
    const {data, error} = await db.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE
    });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email && u.email.trim().toLowerCase() === target) found = {id: u.id};
    }
    if (users.length < USERS_PER_PAGE) return found;
  }
}

export type ConvertLeadResult =
  | {status: 'invited'; inviteId: string; emailSent: boolean}
  | {status: 'reused_invite'; inviteId: string}
  | {status: 'already_user'; userId: string}
  | {status: 'already_converted'};

/**
 * Converte um lead num convite, reaproveitando o mecanismo de convites que já
 * existe. Deduplicação em três níveis, para nunca criar um convite a mais:
 *  1. lead já convertido (tem utilizador) → no-op idempotente;
 *  2. email já é utilizador registado → liga ao utilizador e marca `convertido`;
 *  3. já existe convite PENDENTE para o email → reaproveita-o.
 * Só quando nada disto se aplica é que se cria um convite novo.
 */
export async function convertLeadToInvite(
  leadId: string,
  opts: {locale: Locale; actorId: string; appUrl: string},
  deps: SendEmailDeps = {}
): Promise<ConvertLeadResult> {
  const db = deps.db ?? createAdminClient();
  const {data: lead} = await db
    .from('crm_leads')
    .select('id, full_name, email, converted_invite_id, converted_user_id')
    .eq('id', leadId)
    .single();
  if (!lead) throw new Error('lead não encontrado');
  const email = String(lead.email).trim().toLowerCase();

  if (lead.converted_user_id) return {status: 'already_converted'};

  const now = new Date().toISOString();

  // (2) já é utilizador registado.
  const existingUser = await findUserByEmail(db, email);
  if (existingUser) {
    await db
      .from('crm_leads')
      .update({
        converted_user_id: existingUser.id,
        stage: 'convertido',
        updated_at: now,
        last_activity_at: now
      })
      .eq('id', leadId);
    await addActivity(
      leadId,
      {type: 'mudanca_estado', body: 'Já registado — ligado ao utilizador existente'},
      opts.actorId,
      db
    );
    return {status: 'already_user', userId: existingUser.id};
  }

  // (1b) lead já tem convite associado → nada a recriar.
  if (lead.converted_invite_id) {
    return {status: 'reused_invite', inviteId: lead.converted_invite_id};
  }

  // (3) convite pendente já existente para o email.
  const {data: pending} = await db
    .from('invites')
    .select('id')
    .eq('email', email)
    .eq('status', 'pending')
    .order('created_at', {ascending: false})
    .limit(1)
    .maybeSingle();
  if (pending) {
    await db
      .from('crm_leads')
      .update({
        converted_invite_id: pending.id,
        stage: 'convite_enviado',
        updated_at: now,
        last_activity_at: now
      })
      .eq('id', leadId);
    await addActivity(
      leadId,
      {type: 'mudanca_estado', body: 'Convite pendente existente reutilizado'},
      opts.actorId,
      db
    );
    return {status: 'reused_invite', inviteId: pending.id};
  }

  // Caso base: criar convite novo.
  const res = await createInvite(
    {
      fullName: String(lead.full_name),
      email,
      locale: opts.locale,
      actorId: opts.actorId,
      appUrl: opts.appUrl
    },
    deps
  );
  await db
    .from('crm_leads')
    .update({
      converted_invite_id: res.id,
      stage: 'convite_enviado',
      updated_at: now,
      last_activity_at: now
    })
    .eq('id', leadId);
  await addActivity(
    leadId,
    {type: 'email', body: 'Convite enviado'},
    opts.actorId,
    db
  );
  return {status: 'invited', inviteId: res.id, emailSent: res.emailSent};
}

/**
 * Fecha o ciclo: chamado quando um convite é ACEITE. Liga os leads que geraram
 * este convite ao utilizador criado e move-os para `convertido`. Best-effort —
 * quem chama (aceitação de convite) não deve falhar por causa do CRM.
 */
export async function linkConvertedInvite(
  inviteId: string,
  userId: string,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {data: leads} = await db
    .from('crm_leads')
    .select('id')
    .eq('converted_invite_id', inviteId)
    .is('converted_user_id', null);
  const now = new Date().toISOString();
  for (const l of leads ?? []) {
    await db
      .from('crm_leads')
      .update({
        converted_user_id: userId,
        stage: 'convertido',
        updated_at: now,
        last_activity_at: now
      })
      .eq('id', l.id);
    await db.from('crm_activities').insert({
      lead_id: l.id,
      author_id: null,
      type: 'mudanca_estado',
      body: 'Convite aceite — conta criada'
    });
  }
}

// --- follow-ups (Fatia C) ---

export type FollowupRow = {
  id: string;
  leadId: string;
  leadName: string;
  type: CrmActivityType;
  body: string;
  dueAt: string;
};

/**
 * Follow-ups por resolver: atividades com data agendada e ainda não concluídas.
 * Ordenadas pela data (as mais atrasadas primeiro). Junta o nome do lead para o
 * painel do back-office não ter de o ir buscar linha a linha.
 */
export async function listPendingFollowups(
  db: SupabaseClient = createAdminClient()
): Promise<FollowupRow[]> {
  const {data, error} = await db
    .from('crm_activities')
    .select('id, lead_id, type, body, due_at, crm_leads(full_name)')
    .not('due_at', 'is', null)
    .eq('done', false)
    .order('due_at', {ascending: true});
  if (error) throw new Error(`listar follow-ups falhou: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const lead = row.crm_leads as {full_name?: string} | null;
    return {
      id: row.id as string,
      leadId: row.lead_id as string,
      leadName: lead?.full_name ?? '',
      type: row.type as CrmActivityType,
      body: (row.body as string) ?? '',
      dueAt: row.due_at as string
    };
  });
}

export async function markActivityDone(
  id: string,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {error} = await db
    .from('crm_activities')
    .update({done: true})
    .eq('id', id);
  if (error) throw new Error(`concluir follow-up falhou: ${error.message}`);
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
