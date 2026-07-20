import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const KYC_BUCKET = 'kyc';

/** Caminho canónico no bucket: <userId>/<submissionId>/<docType>-<ficheiro> */
export function kycObjectPath(
  userId: string,
  submissionId: string,
  docType: string,
  filename: string
): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${userId}/${submissionId}/${docType}-${safe}`;
}

/** Sobe um ficheiro para o bucket kyc (service role). */
export async function uploadKycFile(
  path: string,
  file: File,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const {error} = await db.storage
    .from(KYC_BUCKET)
    .upload(path, buffer, {contentType: file.type, upsert: false});
  if (error) throw new Error(`upload kyc falhou: ${error.message}`);
}

/** Emite uma URL assinada de curta duração para um objeto do bucket kyc. */
export async function signedKycUrl(
  path: string,
  expiresInSeconds = 60,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(KYC_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`assinar url kyc falhou: ${error?.message ?? 'sem url'}`);
  }
  return data.signedUrl;
}
