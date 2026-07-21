import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale, TemplateName, TemplatePayloadMap} from '@/lib/mail/templates';

/**
 * Notifica por email os investidores de um projeto com fundos confirmados —
 * quem tem dinheiro no projeto. Decisão de slice da Fatia 5: manifestações de
 * interesse e contratos por transferir NÃO recebem estas notificações.
 * Falhas de envio não rebentam a operação (sendEmail regista em email_outbox).
 */
export async function notifyConfirmedInvestors<T extends TemplateName>(
  db: SupabaseClient,
  projectId: string,
  template: T,
  payload: TemplatePayloadMap[T],
  locale: Locale,
  deps: SendEmailDeps = {}
): Promise<number> {
  const {data: subs} = await db
    .from('subscriptions')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('status', 'fundos_confirmados');

  const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  let sent = 0;
  for (const userId of userIds) {
    const {data} = await db.auth.admin.getUserById(userId);
    const email = data.user?.email;
    if (!email) continue;
    await sendEmail(
      {toEmail: email, locale, template, payload},
      {db, transport: deps.transport}
    );
    sent++;
  }
  return sent;
}
