import {NextResponse} from 'next/server';
import {requireStaff} from '@/lib/auth/staff';
import {clientIp} from '@/lib/auth/request';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedKycUrl} from '@/lib/kyc/storage';

export async function GET(
  req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  let staffId: string;
  try {
    const session = await requireStaff();
    staffId = session.userId;
  } catch {
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  }

  const {id} = await params;
  const db = createAdminClient();

  const {data: doc, error} = await db
    .from('kyc_documents')
    .select('storage_path, submission_id')
    .eq('id', id)
    .single();
  if (error || !doc) {
    return NextResponse.json({error: 'not_found'}, {status: 404});
  }

  // Auditar a consulta ANTES de emitir a URL. Fail-closed: se o registo não
  // for gravado, NÃO se emite a URL — um documento nunca é servido sem rasto.
  const {error: auditError} = await db.from('audit_log').insert({
    actor_id: staffId,
    action: 'view_document',
    entity_type: 'kyc_documents',
    entity_id: id,
    payload: {submission_id: doc.submission_id},
    ip: clientIp(req)
  });
  if (auditError) {
    return NextResponse.json({error: 'audit_failed'}, {status: 500});
  }

  const url = await signedKycUrl(doc.storage_path, 60, db);
  return NextResponse.redirect(url);
}
