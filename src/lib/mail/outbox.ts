import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {getTransport, smtpFrom, type MailTransport} from './smtp';
import {
  renderTemplate,
  type Locale,
  type TemplateName,
  type TemplatePayloadMap
} from './templates';

/**
 * Envio de email síncrono com registo na `email_outbox`.
 *
 * Fluxo: grava a linha (status `sending`) → renderiza → envia via SMTP →
 * marca `sent`. Em falha, marca `failed` com `last_error` e devolve `sent:false`
 * SEM lançar: a ação chamadora (ex.: criar convite) não deve rebentar só porque
 * o email falhou — o convite fica válido e o back-office pode reenviar.
 */
export type SendEmailInput<T extends TemplateName = TemplateName> = {
  toEmail: string;
  toName?: string | null;
  locale: Locale;
  template: T;
  payload: TemplatePayloadMap[T];
};

export type SendEmailDeps = {
  /** Transporte SMTP (injetável nos testes). */
  transport?: MailTransport;
  /** Cliente Supabase com service role (injetável nos testes). */
  db?: SupabaseClient;
};

export type SendEmailResult = {
  id: string;
  sent: boolean;
  error?: string;
};

export async function sendEmail<T extends TemplateName>(
  input: SendEmailInput<T>,
  deps: SendEmailDeps = {}
): Promise<SendEmailResult> {
  const db = deps.db ?? createAdminClient();
  const transport = deps.transport ?? getTransport();

  const {data: row, error: insertError} = await db
    .from('email_outbox')
    .insert({
      to_email: input.toEmail,
      to_name: input.toName ?? null,
      locale: input.locale,
      template: input.template,
      payload: input.payload,
      status: 'sending'
    })
    .select('id')
    .single();

  if (insertError || !row) {
    throw new Error(
      `email_outbox: insert falhou — ${insertError?.message ?? 'sem linha devolvida'}`
    );
  }

  const {subject, html} = renderTemplate(input.template, input.locale, input.payload);

  try {
    await transport.sendMail({
      from: smtpFrom(),
      to: input.toEmail,
      subject,
      html
    });
    await db
      .from('email_outbox')
      .update({status: 'sent', sent_at: new Date().toISOString()})
      .eq('id', row.id);
    return {id: row.id, sent: true};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from('email_outbox')
      .update({status: 'failed', attempts: 1, last_error: message})
      .eq('id', row.id);
    return {id: row.id, sent: false, error: message};
  }
}

/**
 * Reenvia uma entrada existente da outbox (botão de reenvio no back-office).
 * Reaproveita o payload/template gravados; volta a marcar `sent`/`failed`.
 */
export async function resendOutboxEntry(
  id: string,
  deps: SendEmailDeps = {}
): Promise<SendEmailResult> {
  const db = deps.db ?? createAdminClient();
  const transport = deps.transport ?? getTransport();

  const {data: row, error} = await db
    .from('email_outbox')
    .select('id, to_email, locale, template, payload, attempts')
    .eq('id', id)
    .single();
  if (error || !row) {
    throw new Error(`email_outbox: entrada ${id} não encontrada`);
  }

  await db.from('email_outbox').update({status: 'sending'}).eq('id', row.id);

  const {subject, html} = renderTemplate(
    row.template as TemplateName,
    row.locale as Locale,
    row.payload as TemplatePayloadMap[TemplateName]
  );

  try {
    await transport.sendMail({
      from: smtpFrom(),
      to: row.to_email,
      subject,
      html
    });
    await db
      .from('email_outbox')
      .update({status: 'sent', sent_at: new Date().toISOString()})
      .eq('id', row.id);
    return {id: row.id, sent: true};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from('email_outbox')
      .update({
        status: 'failed',
        attempts: (row.attempts ?? 0) + 1,
        last_error: message
      })
      .eq('id', row.id);
    return {id: row.id, sent: false, error: message};
  }
}
