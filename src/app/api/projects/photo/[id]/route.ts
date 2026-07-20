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

  const url = await signedProjectUrl(PHOTOS_BUCKET, photo.storage_path, 300, db);
  return NextResponse.redirect(url);
}
