'use server';

import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';

/**
 * Marca que o utilizador já viu o ecrã de configuração de MFA — para não voltar
 * a ser encaminhado para cá nos próximos logins (a MFA é opcional). O cliente,
 * a seguir, faz `refreshSession()` para o claim `mfa_prompt_seen` ficar fresco.
 */
export async function dismissMfaPrompt(): Promise<void> {
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();
  await admin
    .from('profiles')
    .update({mfa_prompt_seen: true})
    .eq('id', user.id);
}
