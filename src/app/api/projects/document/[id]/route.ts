import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedProjectUrl, DOCS_BUCKET} from '@/lib/projects/storage';

export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: doc} = await db
    .from('project_documents')
    .select('storage_path, project_id')
    .eq('id', id)
    .single();
  if (!doc) return NextResponse.json({error: 'not_found'}, {status: 404});

  // O documento só é acessível se o projeto está visível ao utilizador.
  const {data: project} = await db
    .from('projects')
    .select('status')
    .eq('id', doc.project_id)
    .single();
  const visible =
    project?.status === 'subscricao' || isStaff(session.role);
  if (!visible) return NextResponse.json({error: 'forbidden'}, {status: 403});

  // O catálogo é gated por KYC aprovado. A middleware salta o gate de KYC nas
  // rotas /api, por isso reforçamos aqui: quem não é staff tem de ter KYC
  // aprovado. ANTES do audit — não registamos um acesso que vamos negar.
  if (!isStaff(session.role)) {
    const {data: profile} = await db
      .from('profiles')
      .select('kyc_status')
      .eq('id', session.userId)
      .single();
    if (profile?.kyc_status !== 'approved') {
      return NextResponse.json({error: 'kyc_required'}, {status: 403});
    }
  }

  // Auditar a consulta ANTES de emitir a URL. Fail-closed.
  const {error: auditError} = await db.from('audit_log').insert({
    actor_id: session.userId,
    action: 'view_document',
    entity_type: 'project_documents',
    entity_id: id,
    payload: {project_id: doc.project_id}
  });
  if (auditError) {
    return NextResponse.json({error: 'audit_failed'}, {status: 500});
  }

  const url = await signedProjectUrl(DOCS_BUCKET, doc.storage_path, 60, db);
  return NextResponse.redirect(url);
}
