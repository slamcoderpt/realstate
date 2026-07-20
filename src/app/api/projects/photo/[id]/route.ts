import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedProjectUrl, PHOTOS_BUCKET} from '@/lib/projects/storage';

export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: photo} = await db
    .from('project_photos')
    .select('storage_path, project_id')
    .eq('id', id)
    .single();
  if (!photo) return NextResponse.json({error: 'not_found'}, {status: 404});

  const {data: project} = await db
    .from('projects')
    .select('status')
    .eq('id', photo.project_id)
    .single();
  const visible = project?.status === 'subscricao' || isStaff(session.role);
  if (!visible) return NextResponse.json({error: 'forbidden'}, {status: 403});

  // O catálogo é gated por KYC aprovado. A middleware salta o gate de KYC nas
  // rotas /api, por isso reforçamos aqui: quem não é staff tem de ter KYC
  // aprovado.
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

  const url = await signedProjectUrl(PHOTOS_BUCKET, photo.storage_path, 300, db);
  return NextResponse.redirect(url);
}
