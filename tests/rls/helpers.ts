import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {Client} from 'pg';

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const dbUrl = process.env.SUPABASE_DB_URL!;

/**
 * Tenta TRUNCATE em public.audit_log por ligação SQL directa ao Postgres.
 *
 * Porquê ligação directa e não o cliente Supabase: o PostgREST não tem verbo
 * TRUNCATE, portanto a defesa contra TRUNCATE é inalcançável — e logo
 * intestável — através da API. Só uma ligação SQL directa a exercita.
 *
 * @param asRole se indicado, faz `set role` (ex.: 'service_role') antes do
 *   TRUNCATE, exercitando a **camada de grants**. Se omitido, corre como
 *   `postgres` (owner da tabela), que ignora grants por completo — só o
 *   **trigger** o pode travar. As duas camadas são load-bearing e cada
 *   variante cobre uma; ver o comentário no topo da secção audit_log da migração.
 * @returns o erro lançado pelo Postgres, ou `null` se o TRUNCATE passou
 *   (o que significa que a defesa FALHOU).
 */
export async function attemptTruncateAuditLog(
  asRole?: 'service_role' | 'authenticated' | 'anon'
): Promise<Error | null> {
  const client = new Client({connectionString: dbUrl});
  await client.connect();
  try {
    if (asRole) await client.query(`set role ${asRole}`);
    await client.query('truncate public.audit_log');
    return null;
  } catch (err) {
    return err as Error;
  } finally {
    await client.end();
  }
}

export const TEST_PASSWORD = 'test-password-123!';

/** Cliente com service role — bypassa RLS. Só para preparar dados de teste. */
export const admin = createClient(url, serviceKey, {
  auth: {persistSession: false, autoRefreshToken: false}
});

/** Cliente anónimo, sem sessão. */
export function anonClient(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {persistSession: false, autoRefreshToken: false}
  });
}

export async function createTestUser(
  email: string,
  role: 'investor' | 'project_manager' | 'admin' | 'auditor' = 'investor'
) {
  const {data, error} = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true
  });
  if (error) throw error;
  if (role !== 'investor') {
    const {error: updateError} = await admin
      .from('profiles')
      .update({role})
      .eq('id', data.user.id);
    if (updateError) throw updateError;
  }
  return data.user;
}

export async function signInAs(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const {error} = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD
  });
  if (error) throw error;
  return client;
}
