import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {getAuditActor} from '@/lib/audit/actor';

/**
 * Cliente service_role: contorna a RLS, e por isso `auth.uid()` é nulo do outro
 * lado. O `x-actor-id` é o que permite ao trigger de auditoria saber quem fez a
 * escrita — o PostgREST expõe os cabeçalhos do pedido ao SQL. Sem ator (fora de
 * um pedido autenticado, como aceitar um convite) o cabeçalho não segue e o
 * audit_log fica sem autor, que é o retrato certo desse caso.
 */
export function createAdminClient() {
  const actor = getAuditActor();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {autoRefreshToken: false, persistSession: false},
      ...(actor ? {global: {headers: {'x-actor-id': actor}}} : {})
    }
  );
}
