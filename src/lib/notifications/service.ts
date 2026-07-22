import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

/**
 * Notificações in-app (server-only, service role). Guardam `type` + `payload`;
 * a cópia é renderizada no cliente a partir do namespace i18n `Notifications`,
 * para que uma notificação antiga acompanhe a mudança de idioma.
 */

export type NotificationType =
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'subscription_confirmed'
  | 'work_update'
  | 'statement';

export type NotificationRow = {
  id: string;
  type: NotificationType;
  payload: Record<string, string | number>;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  payload?: Record<string, string | number>;
  href?: string | null;
};

/**
 * Criar uma notificação NUNCA deve rebentar a operação de negócio que a
 * originou — publicar uma atualização de obra tem de continuar a valer mesmo
 * que a notificação falhe. Devolve `false` em vez de lançar, à imagem do que
 * `sendEmail` já faz para o email.
 */
export async function createNotification(
  input: CreateNotificationInput,
  db: SupabaseClient = createAdminClient()
): Promise<boolean> {
  const {error} = await db.from('notifications').insert({
    user_id: input.userId,
    type: input.type,
    payload: input.payload ?? {},
    href: input.href ?? null
  });
  if (error) {
    console.error(`criar notificação falhou: ${error.message}`);
    return false;
  }
  return true;
}

export async function listNotifications(
  userId: string,
  limit = 50,
  db: SupabaseClient = createAdminClient()
): Promise<NotificationRow[]> {
  const {data, error} = await db
    .from('notifications')
    .select('id, type, payload, href, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', {ascending: false})
    .limit(limit);
  if (error) throw new Error(`listar notificações falhou: ${error.message}`);
  return (data ?? []) as NotificationRow[];
}

export async function countUnread(
  userId: string,
  db: SupabaseClient = createAdminClient()
): Promise<number> {
  const {count, error} = await db
    .from('notifications')
    .select('id', {count: 'exact', head: true})
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw new Error(`contar não-lidas falhou: ${error.message}`);
  return count ?? 0;
}

export async function markAllRead(
  userId: string,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {error} = await db
    .from('notifications')
    .update({read_at: new Date().toISOString()})
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw new Error(`marcar como lidas falhou: ${error.message}`);
}
