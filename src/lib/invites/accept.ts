import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';
import {hashToken, isRedeemable} from './token';

/**
 * Aceitação de convite → criação de conta. O controlo é o próprio token (só o
 * destinatário do email o tem); revalida-se sempre o hash e o estado antes de
 * criar a conta. Idempotente: um token já usado/expirado é rejeitado.
 */

export const MIN_PASSWORD_LENGTH = 8;

export type AcceptInviteInput = {
  token: string;
  password: string;
  locale: Locale;
  /** IP do pedido (para registo probatório em invites.accepted_ip). */
  acceptedIp?: string | null;
  appUrl: string;
};

export type AcceptReason = 'invalid' | 'weak_password' | 'email_taken' | 'error';
export type AcceptInviteResult =
  | {ok: true; email: string}
  | {ok: false; reason: AcceptReason};

export async function acceptInvite(
  input: AcceptInviteInput,
  deps: SendEmailDeps = {}
): Promise<AcceptInviteResult> {
  const db = deps.db ?? createAdminClient();

  const {data: invite} = await db
    .from('invites')
    .select('id, full_name, email, status, expires_at')
    .eq('token_hash', hashToken(input.token))
    .single();

  if (
    !invite ||
    !isRedeemable({status: invite.status, expires_at: invite.expires_at})
  ) {
    return {ok: false, reason: 'invalid'};
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return {ok: false, reason: 'weak_password'};
  }

  // Versão dos textos legais aceites, para registo em invites.terms_version.
  const {data: setting} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'terms_version')
    .single();
  const termsVersion =
    typeof setting?.value === 'string'
      ? setting.value
      : setting?.value != null
        ? String(setting.value)
        : null;

  // Criar a conta. O perfil é criado pelo trigger handle_new_user (Fatia 0),
  // que lê full_name/locale do metadata.
  const {data: created, error: createError} = await db.auth.admin.createUser({
    email: invite.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {full_name: invite.full_name, locale: input.locale}
  });
  if (createError || !created?.user) {
    // Causa típica: email já registado (convite já aceite, ou conta existente).
    return {ok: false, reason: 'email_taken'};
  }

  // Marcar aceite apenas se ainda pendente (defesa contra corrida/duplo submit).
  await db
    .from('invites')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_ip: input.acceptedIp ?? null,
      terms_version: termsVersion
    })
    .eq('id', invite.id)
    .eq('status', 'pending');

  await sendEmail(
    {
      toEmail: invite.email,
      toName: invite.full_name,
      locale: input.locale,
      template: 'welcome',
      payload: {
        fullName: invite.full_name,
        loginUrl: `${input.appUrl}/${input.locale}/login`
      }
    },
    {db, transport: deps.transport}
  );

  return {ok: true, email: invite.email};
}
