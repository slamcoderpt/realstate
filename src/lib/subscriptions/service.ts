import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';
import {canTransition, type SubscriptionStatus} from './states';

/**
 * Lógica de subscrições (server-only, service role). Escrita só por aqui,
 * chamada por Server Actions que garantem sessão/KYC (manifestação) ou staff
 * (progressão). RLS é dono-lê + staff-lê; escrita nunca passa por RLS.
 */

export type SubscriptionRow = {
  id: string;
  project_id: string;
  user_id: string;
  amount: number;
  status: SubscriptionStatus;
  contract_path: string | null;
  confirmed_ref: string | null;
  created_at: string;
};

function toRow(raw: Record<string, unknown>): SubscriptionRow {
  return {
    ...(raw as SubscriptionRow),
    amount: Number(raw.amount)
  };
}

async function settingNumber(
  db: SupabaseClient,
  key: string
): Promise<number | null> {
  const {data} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', key)
    .single();
  const v = data?.value;
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export type ManifestInput = {
  userId: string;
  projectId: string;
  amount: number;
  consentVersion: string;
  interestIp?: string;
};

export async function manifestInterest(
  input: ManifestInput,
  deps: SendEmailDeps = {}
): Promise<{id: string}> {
  const db = deps.db ?? createAdminClient();

  const {data: project} = await db
    .from('projects')
    .select('status, name')
    .eq('id', input.projectId)
    .single();
  if (!project || project.status !== 'subscricao') {
    throw new Error('projeto não está em subscrição');
  }

  const {data: profile} = await db
    .from('profiles')
    .select('kyc_status, full_name')
    .eq('id', input.userId)
    .single();
  if (profile?.kyc_status !== 'approved') {
    throw new Error('KYC não aprovado');
  }

  const min = (await settingNumber(db, 'min_subscription_amount')) ?? 0;
  if (input.amount < min) {
    throw new Error(`montante abaixo do mínimo (${min})`);
  }

  const {data: sub, error} = await db
    .from('subscriptions')
    .insert({
      project_id: input.projectId,
      user_id: input.userId,
      amount: input.amount,
      status: 'interesse',
      consent_given: true,
      terms_version: input.consentVersion,
      interest_ip: input.interestIp ?? null
    })
    .select('id')
    .single();
  if (error || !sub) {
    throw new Error(`registar subscrição falhou: ${error?.message ?? 'sem linha'}`);
  }

  await sendEmail(
    {
      toEmail: staffNotifyEmail(),
      locale: 'pt',
      template: 'subscription_interest',
      payload: {
        projectName: project.name,
        investorName: profile?.full_name ?? '',
        amount: formatEur(input.amount)
      }
    },
    {db, transport: deps.transport}
  );

  return {id: sub.id};
}

export type TransitionInput = {
  id: string;
  to: SubscriptionStatus;
  reviewerId: string;
  locale: Locale;
  confirmedRef?: string;
};

export async function transitionSubscription(
  input: TransitionInput,
  deps: SendEmailDeps = {}
): Promise<void> {
  const db = deps.db ?? createAdminClient();
  const {data: cur} = await db
    .from('subscriptions')
    .select('status, project_id, user_id, amount')
    .eq('id', input.id)
    .single();
  if (!cur) throw new Error(`subscrição ${input.id} não encontrada`);
  if (!canTransition(cur.status as SubscriptionStatus, input.to)) {
    throw new Error(`transição inválida: ${cur.status} → ${input.to}`);
  }

  if (input.to === 'fundos_confirmados') {
    const max = await settingNumber(db, 'max_investors_per_project');
    if (max !== null) {
      const {count} = await db
        .from('subscriptions')
        .select('user_id', {count: 'exact', head: true})
        .eq('project_id', cur.project_id)
        .eq('status', 'fundos_confirmados');
      if ((count ?? 0) + 1 > max) {
        throw new Error(`limite de investidores atingido (max ${max})`);
      }
    }
  }

  const patch: Record<string, unknown> = {
    status: input.to,
    reviewed_by: input.reviewerId,
    updated_at: new Date().toISOString()
  };
  if (input.to === 'contrato_assinado') patch.signed_at = new Date().toISOString();
  if (input.to === 'fundos_confirmados') {
    patch.confirmed_at = new Date().toISOString();
    patch.confirmed_ref = input.confirmedRef ?? null;
  }

  const {error} = await db
    .from('subscriptions')
    .update(patch)
    .eq('id', input.id)
    .eq('status', cur.status);
  if (error) throw new Error(`transição falhou: ${error.message}`);

  await recomputeProjectAggregates(db, cur.project_id);

  if (input.to === 'fundos_confirmados') {
    await sendEmail(
      {
        toEmail: await userEmail(db, cur.user_id),
        locale: input.locale,
        template: 'subscription_confirmed',
        payload: {amount: formatEur(Number(cur.amount))}
      },
      {db, transport: deps.transport}
    );
  }
}

export async function attachContract(
  id: string,
  contractStoragePath: string,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {error} = await db
    .from('subscriptions')
    .update({contract_path: contractStoragePath, updated_at: new Date().toISOString()})
    .eq('id', id);
  if (error) throw new Error(`anexar contrato falhou: ${error.message}`);
}

export async function cancelSubscription(
  input: {id: string; byUserId: string; isStaff: boolean},
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {data: cur} = await db
    .from('subscriptions')
    .select('status, user_id, project_id')
    .eq('id', input.id)
    .single();
  if (!cur) throw new Error('subscrição não encontrada');
  if (!input.isStaff && cur.user_id !== input.byUserId) {
    throw new Error('sem permissão para cancelar');
  }
  if (!canTransition(cur.status as SubscriptionStatus, 'cancelada')) {
    throw new Error('não é possível cancelar neste estado');
  }
  const {error} = await db
    .from('subscriptions')
    .update({status: 'cancelada', updated_at: new Date().toISOString()})
    .eq('id', input.id)
    .eq('status', cur.status);
  if (error) throw new Error(`cancelar falhou: ${error.message}`);
  await recomputeProjectAggregates(db, cur.project_id);
}

export async function getMySubscription(
  userId: string,
  projectId: string,
  db: SupabaseClient = createAdminClient()
): Promise<SubscriptionRow | null> {
  const {data} = await db
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .neq('status', 'cancelada')
    .maybeSingle();
  return data ? toRow(data) : null;
}

export async function listProjectSubscriptions(
  projectId: string,
  db: SupabaseClient = createAdminClient()
): Promise<SubscriptionRow[]> {
  const {data, error} = await db
    .from('subscriptions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', {ascending: true});
  if (error) throw new Error(`listar subscrições falhou: ${error.message}`);
  return (data ?? []).map(toRow);
}

// --- helpers ---

async function recomputeProjectAggregates(
  db: SupabaseClient,
  projectId: string
): Promise<void> {
  const {data} = await db
    .from('subscriptions')
    .select('amount, user_id')
    .eq('project_id', projectId)
    .eq('status', 'fundos_confirmados');
  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const investors = new Set(rows.map((r) => r.user_id)).size;
  const {error} = await db
    .from('projects')
    .update({subscribed_amount: total, investor_count: investors})
    .eq('id', projectId);
  if (error) throw new Error(`recomputar agregados falhou: ${error.message}`);
}

async function userEmail(db: SupabaseClient, userId: string): Promise<string> {
  const {data} = await db.auth.admin.getUserById(userId);
  const email = data.user?.email;
  if (!email) throw new Error(`utilizador ${userId} sem email`);
  return email;
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
