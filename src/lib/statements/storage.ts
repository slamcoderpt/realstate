import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const STATEMENTS_BUCKET = 'statements';

export function statementPath(
  projectId: string,
  period: string,
  version: number,
  filename: string
): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${projectId}/${period}-v${version}-${safe}`;
}

export async function uploadStatement(
  path: string,
  file: File,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const {error} = await db.storage
    .from(STATEMENTS_BUCKET)
    .upload(path, buffer, {contentType: file.type, upsert: false});
  if (error) throw new Error(`upload extrato falhou: ${error.message}`);
}

/**
 * Apaga um objeto do bucket. Existe para a limpeza de órfãos (upload feito,
 * insert falhado), por isso NUNCA lança: quem chama já está a tratar um erro
 * anterior que não pode ser mascarado por uma falha de limpeza.
 */
export async function removeStatement(
  path: string,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  try {
    // `remove()` devolve `{error}` em vez de lançar; ambos os casos são
    // ignorados de propósito — best-effort, ver comentário acima.
    await db.storage.from(STATEMENTS_BUCKET).remove([path]);
  } catch {
    // idem.
  }
}

export async function signedStatementUrl(
  path: string,
  expiresInSeconds = 60,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(STATEMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`assinar url extrato falhou: ${error?.message ?? 'sem url'}`);
  }
  return data.signedUrl;
}
