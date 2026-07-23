import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const WORK_DOCS_BUCKET = 'work-docs';

// Caminho único e legível: <projeto>/<epoch>-<ficheiro-saneado>. O prefixo
// temporal evita colisões entre faturas com o mesmo nome. (Sem Date global no
// caminho por si só — recebe-se o carimbo de quem chama.)
export function workDocPath(
  projectId: string,
  stamp: number,
  filename: string
): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${projectId}/${stamp}-${safe}`;
}

export async function uploadWorkDoc(
  path: string,
  file: File,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const {error} = await db.storage
    .from(WORK_DOCS_BUCKET)
    .upload(path, buffer, {contentType: file.type, upsert: false});
  if (error) throw new Error(`upload documento de obra falhou: ${error.message}`);
}

/**
 * Apaga um objeto do bucket. Best-effort: NUNCA lança — é usado tanto na
 * limpeza de órfãos (insert falhado após upload) como na eliminação por staff,
 * e uma falha de limpeza não deve mascarar o erro que a motivou.
 */
export async function removeWorkDoc(
  path: string,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  try {
    await db.storage.from(WORK_DOCS_BUCKET).remove([path]);
  } catch {
    // best-effort.
  }
}

export async function signedWorkDocUrl(
  path: string,
  expiresInSeconds = 60,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(WORK_DOCS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(
      `assinar url documento de obra falhou: ${error?.message ?? 'sem url'}`
    );
  }
  return data.signedUrl;
}
