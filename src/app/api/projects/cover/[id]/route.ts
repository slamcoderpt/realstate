import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedProjectUrl, PHOTOS_BUCKET} from '@/lib/projects/storage';

/**
 * Capa do projeto. O `id` aqui é o do PROJETO (a capa não tem linha própria;
 * é `projects.cover_path`), ao contrário de `/api/projects/photo/[id]`, que
 * recebe o id da foto.
 *
 * O gate é EXATAMENTE o da rota das fotos — sessão, projeto em `subscricao`
 * (ou staff) e KYC aprovado para quem não é staff. O catálogo só é visível a
 * investidores convidados e com KYC aprovado; se esta rota fosse mais folgada,
 * era por aqui que se contornava esse gate.
 */
export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: project} = await db
    .from('projects')
    .select('status, cover_path')
    .eq('id', id)
    .single();
  // Sem projeto ou sem capa: 404 — não há objeto a servir.
  if (!project?.cover_path) {
    return NextResponse.json({error: 'not_found'}, {status: 404});
  }

  const visible = project.status === 'subscricao' || isStaff(session.role);
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

  const url = await signedProjectUrl(PHOTOS_BUCKET, project.cover_path, 300, db);
  return NextResponse.redirect(url);
}
