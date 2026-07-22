'use server';

import {getSession} from '@/lib/auth/staff';
import {
  listNotifications,
  markAllRead,
  countUnread
} from '@/lib/notifications/service';
import type {NotificationRow} from '@/lib/notifications/service';

/**
 * Todas as actions derivam o utilizador da SESSÃO — nunca de um parâmetro. Um
 * `userId` vindo do cliente seria um IDOR: qualquer pessoa leria ou marcaria as
 * notificações de outra.
 */
export async function myNotificationsAction(
  limit = 10
): Promise<NotificationRow[]> {
  const session = await getSession();
  if (!session) return [];
  return listNotifications(session.userId, limit);
}

export async function markAllReadAction(): Promise<number> {
  const session = await getSession();
  if (!session) return 0;
  await markAllRead(session.userId);
  return countUnread(session.userId);
}
