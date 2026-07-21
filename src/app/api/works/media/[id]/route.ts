import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedMediaUrl} from '@/lib/works/storage';

/**
 * Media de obra por URL assinada de curta duração. O bucket `work-media` é
 * privado e o browser nunca recebe o storage_path — só este id. A verificação
 * aqui é a ÚNICA barreira entre um investidor e a media de outro projeto.
 *
 * Sem audit_log: media de obra não é documento legal (mesmo tratamento das
 * fotos de projeto; contrasta com KYC/contrato, que auditam).
 *
 * Gate: sessão + (subscrição ATIVA no projeto OU staff). Não repetimos o
 * gate de KYC das rotas de catálogo — ter subscrição já implica KYC aprovado.
 */
export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: media} = await db
    .from('work_update_media')
    .select('storage_path, work_update_id')
    .eq('id', id)
    .single();
  if (!media) return NextResponse.json({error: 'not_found'}, {status: 404});

  const {data: update} = await db
    .from('work_updates')
    .select('project_id')
    .eq('id', media.work_update_id)
    .single();
  if (!update) return NextResponse.json({error: 'not_found'}, {status: 404});

  let allowed = isStaff(session.role);
  if (!allowed) {
    const {count} = await db
      .from('subscriptions')
      .select('id', {count: 'exact', head: true})
      .eq('project_id', update.project_id)
      .eq('user_id', session.userId)
      .neq('status', 'cancelada');
    allowed = (count ?? 0) > 0;
  }
  if (!allowed) return NextResponse.json({error: 'forbidden'}, {status: 403});

  const url = await signedMediaUrl(media.storage_path, 300, db);
  return NextResponse.redirect(url);
}
