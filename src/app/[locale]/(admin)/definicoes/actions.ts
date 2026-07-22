'use server';

import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import type {Locale} from '@/lib/mail/templates';

export type SaveSettingState = {
  ok: boolean;
  error?: 'invalidJson';
  /**
   * O JSON efetivamente gravado. O cliente precisa dele para actualizar a sua
   * referência do "valor guardado": sem isto continuaria a comparar contra o
   * valor com que a página foi carregada, e voltar ao valor antigo escondia o
   * botão de guardar apesar de a base já ter o novo.
   */
  saved?: string;
};

/**
 * Devolve estado em vez de lançar no caso do JSON inválido: um `throw` numa
 * Server Action cai no error boundary (e em produção a mensagem é redigida
 * para um digest), pelo que não haveria como mostrar `SettingsAdmin.invalidJson`.
 * O `requireAdmin()` continua a lançar — quem não é admin não deve ver uma
 * mensagem simpática, deve bater com a porta fechada.
 */
export async function saveSettingAction(
  locale: Locale,
  key: string,
  _prev: SaveSettingState,
  formData: FormData
): Promise<SaveSettingState> {
  await requireAdmin();
  const raw = String(formData.get('value') ?? '');

  // Validar aqui para dar erro legível; o cast no RPC é a rede de segurança.
  try {
    JSON.parse(raw);
  } catch {
    return {ok: false, error: 'invalidJson'};
  }

  // Via RPC porque o PostgREST NÃO consegue escrever jsonb `null`
  // ({value: null} vira SQL NULL e viola o not null) — e `null` é exatamente o
  // valor de "sem limite" de max_investors_per_project.
  const db = createAdminClient();
  const {error} = await db.rpc('set_platform_setting', {
    p_key: key,
    p_value_json: raw
  });
  if (error) throw new Error(`guardar definição falhou: ${error.message}`);

  // Rota dinâmica: o caminho concreto é no-op, o padrão do segmento é que conta.
  revalidatePath('/[locale]/definicoes', 'page');
  revalidatePath(`/${locale}/definicoes`);
  return {ok: true, saved: raw};
}
