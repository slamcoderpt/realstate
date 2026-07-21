import {describe, it, expect} from 'vitest';
import {Client} from 'pg';

/**
 * Hardening de grants (defesa em profundidade): anon e authenticated não devem
 * ter grant de escrita (INSERT/UPDATE/DELETE) nas tabelas de negócio. A RLS já
 * nega a escrita (não há políticas de escrita), mas sem grant a escrita falha
 * ANTES da RLS — "permission denied for table" em vez de "row-level security".
 *
 * Testado por ligação SQL direta (set role), à semelhança do teste de TRUNCATE
 * do audit_log: exercita exatamente o role que o PostgREST assume a partir do JWT.
 */

const dbUrl = process.env.SUPABASE_DB_URL!;

// Uma tabela representativa por grupo (fundações, convites, KYC, projetos).
const BUSINESS_TABLES = [
  'profiles',
  'platform_settings',
  'invites',
  'email_outbox',
  'kyc_submissions',
  'kyc_documents',
  'projects',
  'project_budget_lines',
  'project_photos',
  'project_documents',
  'subscriptions',
  'project_milestones',
  'work_updates',
  'work_update_media',
  'account_statements'
];

/**
 * Tenta um INSERT trivial numa tabela sob um dado role, dentro de uma transação
 * revertida (não polui dados). Devolve o erro do Postgres, ou null se passou.
 */
async function attemptInsertAs(
  role: 'anon' | 'authenticated' | 'service_role',
  table: string
): Promise<Error | null> {
  const client = new Client({connectionString: dbUrl});
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    // INSERT com colunas mínimas irrelevantes: se o grant existir, falha na RLS
    // ou numa constraint; se o grant NÃO existir, falha em "permission denied"
    // antes de qualquer avaliação de RLS/constraint.
    await client.query(`insert into public.${table} default values`);
    return null;
  } catch (err) {
    return err as Error;
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}

describe('grants de escrita revogados para anon/authenticated', () => {
  for (const table of BUSINESS_TABLES) {
    it(`authenticated NÃO pode escrever em ${table} (permission denied)`, async () => {
      const err = await attemptInsertAs('authenticated', table);
      expect(err).not.toBeNull();
      expect(err!.message).toMatch(/permission denied/i);
    });

    it(`anon NÃO pode escrever em ${table} (permission denied)`, async () => {
      const err = await attemptInsertAs('anon', table);
      expect(err).not.toBeNull();
      expect(err!.message).toMatch(/permission denied/i);
    });
  }
});

describe('service_role mantém grant de escrita', () => {
  it('service_role consegue INSERT em platform_settings (grant intacto)', async () => {
    // platform_settings tem PK `key` (text) sem default — usamos um insert real
    // e revertemos. Se o grant do service_role tivesse sido revogado, falharia
    // com "permission denied"; queremos confirmar que NÃO falha por isso.
    const client = new Client({connectionString: dbUrl});
    await client.connect();
    let permissionError = false;
    try {
      await client.query('begin');
      await client.query('set local role service_role');
      await client.query(
        `insert into public.platform_settings (key, value) values ('__test_grant__', '1'::jsonb)`
      );
    } catch (err) {
      if (/permission denied/i.test((err as Error).message)) permissionError = true;
    } finally {
      await client.query('rollback').catch(() => {});
      await client.end();
    }
    expect(permissionError).toBe(false);
  });
});
