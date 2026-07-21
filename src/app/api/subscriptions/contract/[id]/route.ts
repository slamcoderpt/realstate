import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {clientIp} from '@/lib/auth/request';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedContractUrl} from '@/lib/subscriptions/storage';

export async function GET(
  req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: sub} = await db
    .from('subscriptions')
    .select('contract_path, user_id')
    .eq('id', id)
    .single();
  if (!sub || !sub.contract_path) {
    return NextResponse.json({error: 'not_found'}, {status: 404});
  }
  const owner = sub.user_id === session.userId;
  if (!owner && !isStaff(session.role)) {
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  }

  const {error: auditError} = await db.from('audit_log').insert({
    actor_id: session.userId,
    action: 'view_document',
    entity_type: 'subscription_contract',
    entity_id: id,
    payload: {},
    ip: clientIp(req)
  });
  if (auditError) {
    return NextResponse.json({error: 'audit_failed'}, {status: 500});
  }

  const url = await signedContractUrl(sub.contract_path, 60, db);
  return NextResponse.redirect(url);
}
