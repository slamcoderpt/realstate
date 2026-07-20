import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const PHOTOS_BUCKET = 'project-photos';
export const DOCS_BUCKET = 'project-docs';

export function projectObjectPath(
  projectId: string,
  kind: string,
  filename: string
): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${projectId}/${kind}-${Date.now()}-${safe}`;
}

export async function uploadProjectFile(
  bucket: string,
  path: string,
  file: File,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const {error} = await db.storage
    .from(bucket)
    .upload(path, buffer, {contentType: file.type, upsert: false});
  if (error) throw new Error(`upload projeto falhou: ${error.message}`);
}

export async function signedProjectUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 60,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`assinar url projeto falhou: ${error?.message ?? 'sem url'}`);
  }
  return data.signedUrl;
}
