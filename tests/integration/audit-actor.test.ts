import {describe, it, expect, beforeAll} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';

/**
 * O `audit_log` tem de registar QUEM fez a escrita.
 *
 * As escritas da app passam por service_role, onde `auth.uid()` é nulo; o
 * cliente admin envia o utilizador em `x-actor-id` e o trigger lê-o dos
 * cabeçalhos do pedido. Estes testes exercitam esse caminho tal como ele corre
 * em produção — pelo PostgREST, que é quem publica os cabeçalhos ao SQL — e não
 * por SQL directo, que nunca os teria.
 */

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function clientWithHeaders(headers: Record<string, string>) {
  return createClient(url, serviceKey, {
    auth: {autoRefreshToken: false, persistSession: false},
    global: {headers}
  });
}

/** Entrada de auditoria do INSERT de um lead. */
async function auditOf(leadId: string) {
  const {data} = await admin
    .from('audit_log')
    .select('actor_id, action')
    .eq('entity_type', 'crm_leads')
    .eq('entity_id', leadId)
    .eq('action', 'insert')
    .single();
  return data;
}

async function insertLead(
  db: ReturnType<typeof clientWithHeaders>
): Promise<string> {
  const {data, error} = await db
    .from('crm_leads')
    .insert({full_name: 'Auditado', email: `audit-${randomUUID().slice(0, 8)}@test.local`})
    .select('id')
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

let actorId: string;

beforeAll(async () => {
  actorId = (
    await createTestUser(`audit-actor-${randomUUID().slice(0, 8)}@test.local`, 'admin')
  ).id;
});

describe('audit_log: autor da escrita', () => {
  it('regista o utilizador enviado em x-actor-id', async () => {
    const id = await insertLead(clientWithHeaders({'x-actor-id': actorId}));
    expect((await auditOf(id))!.actor_id).toBe(actorId);
  });

  it('sem cabeçalho fica sem autor (fluxos não autenticados)', async () => {
    const id = await insertLead(clientWithHeaders({}));
    expect((await auditOf(id))!.actor_id).toBeNull();
  });

  it('cabeçalho inválido não parte a escrita — só fica sem autor', async () => {
    // Valor ASCII de propósito: cabeçalhos HTTP não levam acentos, e o que se
    // quer testar é o uuid inválido, não a codificação.
    const id = await insertLead(clientWithHeaders({'x-actor-id': 'nao-e-um-uuid'}));
    expect((await auditOf(id))!.actor_id).toBeNull();
  });
});
