import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale, TemplateName, TemplatePayloadMap} from '@/lib/mail/templates';
import {
  createNotification,
  type NotificationType
} from '@/lib/notifications/service';

/**
 * Template de email → tipo de notificação in-app. Mapa EXPLÍCITO: o tipo nunca
 * é derivado do nome do template por manipulação de string, para que um
 * template novo sem entrada aqui simplesmente não gere notificação (em vez de
 * gerar uma com um tipo inventado que a BD ou o i18n não conhecem).
 */
const TEMPLATE_TO_NOTIFICATION: Partial<Record<TemplateName, NotificationType>> = {
  work_update_published: 'work_update',
  statement_published: 'statement'
};

/**
 * Notifica os investidores de um projeto com fundos confirmados — quem tem
 * dinheiro no projeto. Decisão de slice da Fatia 5: manifestações de interesse
 * e contratos por transferir NÃO recebem estas notificações.
 *
 * Email e notificação in-app nascem no MESMO ciclo, para não poderem divergir:
 * quem recebe um recebe o outro. Falhas de envio não rebentam a operação
 * (sendEmail regista em email_outbox, createNotification devolve false).
 */
export async function notifyConfirmedInvestors<T extends TemplateName>(
  db: SupabaseClient,
  projectId: string,
  template: T,
  payload: TemplatePayloadMap[T],
  locale: Locale,
  deps: SendEmailDeps = {},
  href?: string
): Promise<number> {
  const {data: subs} = await db
    .from('subscriptions')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('status', 'fundos_confirmados');

  const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];

  // O idioma é o DE CADA DESTINATÁRIO, não o de quem publicou. O `locale`
  // recebido é só o recurso para quem ainda não escolheu — sem isto, um gestor
  // a publicar em português mandava o email em português a um investidor que
  // configurou inglês. Uma query para todos, não uma por investidor.
  const {data: perfis} = await db
    .from('profiles')
    .select('id, preferred_locale')
    .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
  const localePorUtilizador = new Map<string, Locale>(
    (perfis ?? []).map((p) => [
      p.id as string,
      (p.preferred_locale === 'en' ? 'en' : 'pt') as Locale
    ])
  );

  const notificationType = TEMPLATE_TO_NOTIFICATION[template];
  let sent = 0;
  for (const userId of userIds) {
    const {data} = await db.auth.admin.getUserById(userId);
    const email = data.user?.email;
    if (!email) continue;
    await sendEmail(
      {
        toEmail: email,
        locale: localePorUtilizador.get(userId) ?? locale,
        template,
        payload
      },
      {db, transport: deps.transport}
    );
    if (notificationType) {
      // O MESMO payload do email: as chaves que os corpos i18n interpolam
      // (`projectName`/`updateTitle`, `period`/`projectName`) são exatamente
      // estas. Guarda-se o payload, nunca a frase renderizada.
      await createNotification(
        {
          userId,
          type: notificationType,
          payload: {...payload},
          href: href ?? null
        },
        db
      );
    }
    sent++;
  }
  return sent;
}
