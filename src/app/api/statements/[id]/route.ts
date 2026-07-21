import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedStatementUrl} from '@/lib/statements/storage';

/**
 * Extrato da conta dedicada por URL assinada de curta duração. O bucket
 * `statements` é privado e o browser nunca vê o storage_path — só este id.
 *
 * Duas diferenças deliberadas face à media de obra (`/api/works/media/[id]`):
 *
 *  1. Gate mais apertado: só staff ou investidor com `fundos_confirmados` no
 *     projeto. A obra abre a qualquer subscrição ativa; os extratos são a
 *     conta que detém o dinheiro e só quem lá tem dinheiro os vê. Não unificar.
 *
 *  2. Auditoria ANTES de emitir a URL, fail-closed. São registos financeiros:
 *     uma consulta não registada é uma falha de compliance, logo um insert de
 *     audit falhado bloqueia o download em vez de degradar em silêncio.
 *     (`audit_log` é append-only: UPDATE/DELETE/TRUNCATE revogados + triggers.)
 *
 * A convenção de auditoria segue a do contrato de subscrição
 * (`/api/subscriptions/contract/[id]`): action `view_document` + o nome da
 * tabela em `entity_type`. Aqui o payload leva `project_id` e `period` — o
 * contrato usa `{}` — porque o auditor precisa de saber QUE extrato foi visto
 * sem ter de reler a tabela.
 */
export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: st} = await db
    .from('account_statements')
    .select('storage_path, project_id, period')
    .eq('id', id)
    .single();
  if (!st) return NextResponse.json({error: 'not_found'}, {status: 404});

  let allowed = isStaff(session.role);
  if (!allowed) {
    const {count} = await db
      .from('subscriptions')
      .select('id', {count: 'exact', head: true})
      .eq('project_id', st.project_id)
      .eq('user_id', session.userId)
      .eq('status', 'fundos_confirmados');
    allowed = (count ?? 0) > 0;
  }
  if (!allowed) return NextResponse.json({error: 'forbidden'}, {status: 403});

  const {error: auditError} = await db.from('audit_log').insert({
    actor_id: session.userId,
    action: 'view_document',
    entity_type: 'account_statements',
    entity_id: id,
    payload: {project_id: st.project_id, period: st.period}
  });
  if (auditError) {
    return NextResponse.json({error: 'audit_failed'}, {status: 500});
  }

  const url = await signedStatementUrl(st.storage_path, 60, db);
  return NextResponse.redirect(url);
}
