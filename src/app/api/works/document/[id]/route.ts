import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {clientIp} from '@/lib/auth/request';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedWorkDocUrl} from '@/lib/works/service';

/**
 * Documento/fatura de obra por URL assinada de curta duração. O bucket
 * `work-docs` é privado e o browser nunca vê o storage_path — só este id.
 *
 * Gate: sessão + (subscrição ATIVA no projeto OU staff) — o mesmo critério da
 * obra e da sua media (mais folgado que os extratos, que exigem fundos
 * confirmados). As faturas fazem parte do acompanhamento da obra, não da conta.
 *
 * Auditoria ANTES de emitir a URL, fail-closed: uma fatura é um documento, e o
 * acesso a documentos é registado (como nos extratos e no contrato). Um insert
 * de audit falhado bloqueia o download em vez de degradar em silêncio.
 */
export async function GET(
  req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: doc} = await db
    .from('work_documents')
    .select('storage_path, project_id')
    .eq('id', id)
    .single();
  if (!doc) return NextResponse.json({error: 'not_found'}, {status: 404});

  let allowed = isStaff(session.role);
  if (!allowed) {
    const {count} = await db
      .from('subscriptions')
      .select('id', {count: 'exact', head: true})
      .eq('project_id', doc.project_id)
      .eq('user_id', session.userId)
      .neq('status', 'cancelada');
    allowed = (count ?? 0) > 0;
  }
  if (!allowed) return NextResponse.json({error: 'forbidden'}, {status: 403});

  const {error: auditError} = await db.from('audit_log').insert({
    actor_id: session.userId,
    action: 'view_document',
    entity_type: 'work_documents',
    entity_id: id,
    payload: {project_id: doc.project_id},
    ip: clientIp(req)
  });
  if (auditError) {
    return NextResponse.json({error: 'audit_failed'}, {status: 500});
  }

  const url = await signedWorkDocUrl(doc.storage_path, 60, db);
  return NextResponse.redirect(url);
}
