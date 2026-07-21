import {expect} from 'vitest';
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

/**
 * Um anónimo não pode ler `table`. Aceita as DUAS negações válidas:
 * `42501 permission denied` (sem grant — a postura preferida, nega antes da
 * RLS) ou 0 linhas (o grant existe mas nenhuma política se aplica).
 *
 * O controlo positivo é o que impede a asserção de ser oca: confirma primeiro,
 * com service role, que a tabela existe e TEM linhas. Sem ele, "0 linhas"
 * passaria numa tabela vazia — ou inexistente, que é como o repo já foi
 * mordido antes (`42P01` devolve `data: null`, e `null ?? []` tem length 0).
 */
export async function expectAnonCannotRead(table: string): Promise<void> {
  const {count, error: adminError} = await admin
    .from(table)
    .select('*', {count: 'exact', head: true});
  expect(adminError).toBeNull();
  expect(count ?? 0).toBeGreaterThan(0);

  const {data, error} = await anonClient().from(table).select('*');
  if (error) {
    expect(error.code).toBe('42501');
    return;
  }
  expect(data ?? []).toHaveLength(0);
}

/**
 * `client` não vê a linha `id` de `table`, e a negação vem mesmo da RLS.
 *
 * Mesma armadilha que `expectAnonCannotRead` fecha, aplicada a uma linha
 * concreta: `expect(data ?? []).toHaveLength(0)` passa também quando a query
 * rebenta (tabela/coluna inexistente devolve `data: null`). Daí o controlo
 * positivo com service role — a linha EXISTE — mais o `error` a null.
 */
export async function expectRowHidden(
  client: SupabaseClient,
  table: string,
  id: string
): Promise<void> {
  const {count, error: adminError} = await admin
    .from(table)
    .select('id', {count: 'exact', head: true})
    .eq('id', id);
  expect(adminError).toBeNull();
  expect(count).toBe(1);

  const {data, error} = await client.from(table).select('id').eq('id', id);
  expect(error).toBeNull();
  expect(data ?? []).toHaveLength(0);
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
