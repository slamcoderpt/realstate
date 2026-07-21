import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const WORK_MEDIA_BUCKET = 'work-media';

/** Tipos aceites — espelham `allowed_mime_types` do bucket (que é quem impõe). */
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime'];

export function mediaTypeFor(mime: string): 'photo' | 'video' | null {
  if (ALLOWED_IMAGE_MIME.includes(mime)) return 'photo';
  if (ALLOWED_VIDEO_MIME.includes(mime)) return 'video';
  return null;
}

export function workMediaPath(updateId: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${updateId}/${Date.now()}-${safe}`;
}

/**
 * URL assinada de UPLOAD para o browser enviar o ficheiro diretamente ao
 * Storage (vídeos excedem o limite do Server Action). O bucket impõe
 * file_size_limit e allowed_mime_types — é a validação efetiva neste caminho.
 */
export async function createMediaUploadUrl(
  path: string,
  db: SupabaseClient = createAdminClient()
): Promise<{path: string; token: string}> {
  const {data, error} = await db.storage
    .from(WORK_MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`criar url de upload falhou: ${error?.message ?? 'sem url'}`);
  }
  return {path: data.path, token: data.token};
}

/** URL assinada de leitura (fotos e streaming de vídeo). */
export async function signedMediaUrl(
  path: string,
  expiresInSeconds = 300,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(WORK_MEDIA_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`assinar url media falhou: ${error?.message ?? 'sem url'}`);
  }
  return data.signedUrl;
}
