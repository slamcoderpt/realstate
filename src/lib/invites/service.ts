import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';
import {generateInviteToken} from './token';

/**
 * Lógica de convites (server-side, service role). O controlo de acesso
 * (staff-only) é feito pela Server Action que chama estas funções — aqui já se
 * assume um ator autorizado. `invited_by` regista de forma autoritativa QUEM
 * convidou (entra também no payload do audit_log via trigger da Fatia 0).
 */

export type InviteRole = 'investor' | 'project_manager' | 'admin' | 'auditor';

const DEFAULT_VALIDITY_DAYS = 14;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pt-PT', {
    dateStyle: 'long'
  }).format(date);
}

async function validityDays(db: SupabaseClient): Promise<number> {
  const {data} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'invite_validity_days')
    .single();
  const value = data?.value;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_VALIDITY_DAYS;
}

export type CreateInviteInput = {
  fullName: string;
  email: string;
  role?: InviteRole;
  locale: Locale;
  /** id do admin/PM que convida (auth.users.id). */
  actorId: string;
  /** origem absoluta da app, ex.: https://app.tilweni.pt */
  appUrl: string;
};

export type CreateInviteResult = {
  id: string;
  emailSent: boolean;
  emailError?: string;
};

export async function createInvite(
  input: CreateInviteInput,
  deps: SendEmailDeps = {}
): Promise<CreateInviteResult> {
  const db = deps.db ?? createAdminClient();
  const email = normalizeEmail(input.email);
  const fullName = input.fullName.trim();
  const days = await validityDays(db);
  const expiresAt = new Date(Date.now() + days * 864e5);
  const {token, hash} = generateInviteToken();

  const {data: invite, error} = await db
    .from('invites')
    .insert({
      full_name: fullName,
      email,
      token_hash: hash,
      invited_by: input.actorId,
      role: input.role ?? 'investor',
      expires_at: expiresAt.toISOString()
    })
    .select('id')
    .single();
  if (error || !invite) {
    throw new Error(`criar convite falhou: ${error?.message ?? 'sem linha'}`);
  }

  const url = `${input.appUrl}/${input.locale}/aceitar-convite/${token}`;
  const mail = await sendEmail(
    {
      toEmail: email,
      toName: fullName,
      locale: input.locale,
      template: 'invite',
      payload: {fullName, url, expiresAt: formatDate(expiresAt, input.locale)}
    },
    {db, transport: deps.transport}
  );

  return {id: invite.id, emailSent: mail.sent, emailError: mail.error};
}

/** Revoga um convite pendente (idempotente: só afeta pendentes). */
export async function revokeInvite(
  id: string,
  deps: SendEmailDeps = {}
): Promise<void> {
  const db = deps.db ?? createAdminClient();
  const {error} = await db
    .from('invites')
    .update({status: 'revoked'})
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw new Error(`revogar convite falhou: ${error.message}`);
}

/**
 * Reenvia um convite pendente com um token NOVO — invalida o anterior (o
 * token_hash muda) e renova a validade. Volta a enviar o email.
 */
export async function resendInvite(
  input: {
    id: string;
    locale: Locale;
    appUrl: string;
  },
  deps: SendEmailDeps = {}
): Promise<CreateInviteResult> {
  const db = deps.db ?? createAdminClient();
  const {data: existing, error: readError} = await db
    .from('invites')
    .select('id, full_name, email, status')
    .eq('id', input.id)
    .single();
  if (readError || !existing) {
    throw new Error(`convite ${input.id} não encontrado`);
  }
  if (existing.status !== 'pending') {
    throw new Error('só convites pendentes podem ser reenviados');
  }

  const days = await validityDays(db);
  const expiresAt = new Date(Date.now() + days * 864e5);
  const {token, hash} = generateInviteToken();

  const {error: updateError} = await db
    .from('invites')
    .update({token_hash: hash, expires_at: expiresAt.toISOString()})
    .eq('id', input.id);
  if (updateError) {
    throw new Error(`reenviar convite falhou: ${updateError.message}`);
  }

  const url = `${input.appUrl}/${input.locale}/aceitar-convite/${token}`;
  const mail = await sendEmail(
    {
      toEmail: existing.email,
      toName: existing.full_name,
      locale: input.locale,
      template: 'invite',
      payload: {
        fullName: existing.full_name,
        url,
        expiresAt: formatDate(expiresAt, input.locale)
      }
    },
    {db, transport: deps.transport}
  );

  return {id: input.id, emailSent: mail.sent, emailError: mail.error};
}
