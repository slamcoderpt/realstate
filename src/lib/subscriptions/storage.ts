import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const CONTRACTS_BUCKET = 'contracts';

export function contractPath(
  subscriptionId: string,
  filename: string
): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${subscriptionId}/${Date.now()}-${safe}`;
}

export async function uploadContract(
  path: string,
  file: File,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const {error} = await db.storage
    .from(CONTRACTS_BUCKET)
    .upload(path, buffer, {contentType: file.type, upsert: false});
  if (error) throw new Error(`upload contrato falhou: ${error.message}`);
}

export async function signedContractUrl(
  path: string,
  expiresInSeconds = 60,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(CONTRACTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`assinar url contrato falhou: ${error?.message ?? 'sem url'}`);
  }
  return data.signedUrl;
}
