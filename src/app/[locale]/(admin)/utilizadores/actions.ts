'use server';

import {revalidatePath} from 'next/cache';
import {requireAdmin, type Session} from '@/lib/auth/staff';
import {changeUserRole, isUserRole} from '@/lib/users/service';

export type ChangeRoleState = {
  ok: boolean;
  error?: 'self_demotion' | 'forbidden' | 'invalid_role' | 'generic';
  message?: string;
};

/**
 * O `actorId` vem SEMPRE da sessão, nunca do formulário: um id de ator enviado
 * pelo cliente permitiria contornar o guard de auto-despromoção bastando mentir
 * sobre quem se é.
 *
 * Devolve um resultado em vez de lançar — uma Server Action que lança sobe até
 * ao error boundary e substitui a página inteira por um ecrã de erro, quando o
 * que aqui se quer é uma linha da tabela a explicar porque não gravou.
 */
export async function changeUserRoleAction(
  locale: string,
  targetId: string,
  formData: FormData
): Promise<ChangeRoleState> {
  let session: Session;
  try {
    session = await requireAdmin();
  } catch {
    return {ok: false, error: 'forbidden'};
  }

  const role = formData.get('role');
  if (!isUserRole(role)) return {ok: false, error: 'invalid_role'};

  try {
    await changeUserRole({actorId: session.userId, targetId, role});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/próprio|proprio/i.test(message)) {
      return {ok: false, error: 'self_demotion'};
    }
    return {ok: false, error: 'generic', message};
  }

  revalidatePath(`/${locale}/utilizadores`);
  return {ok: true};
}
