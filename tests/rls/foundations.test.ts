import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser, signInAs, anonClient} from './helpers';

const run = randomUUID().slice(0, 8);
const investorA = `investor-a-${run}@test.local`;
const investorB = `investor-b-${run}@test.local`;

let idA: string;
let idB: string;

beforeAll(async () => {
  idA = (await createTestUser(investorA)).id;
  idB = (await createTestUser(investorB)).id;
});

describe('profiles', () => {
  it('perfil é criado automaticamente ao criar o utilizador', async () => {
    const {data, error} = await admin
      .from('profiles')
      .select('id, role, kyc_status, preferred_locale')
      .eq('id', idA)
      .single();
    expect(error).toBeNull();
    expect(data!.role).toBe('investor');
    expect(data!.kyc_status).toBe('pending');
    expect(data!.preferred_locale).toBe('pt');
  });

  it('investidor lê o seu próprio perfil', async () => {
    const client = await signInAs(investorA);
    const {data, error} = await client.from('profiles').select('id').eq('id', idA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO lê o perfil de outro investidor', async () => {
    const client = await signInAs(investorA);
    const {data, error} = await client.from('profiles').select('id').eq('id', idB);
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS filtra silenciosamente
  });

  it('investidor NÃO consegue elevar o seu próprio role', async () => {
    const client = await signInAs(investorA);
    await client.from('profiles').update({role: 'admin'}).eq('id', idA);
    const {data} = await admin.from('profiles').select('role').eq('id', idA).single();
    expect(data!.role).toBe('investor');
  });
});

describe('platform_settings', () => {
  it('utilizador autenticado lê settings', async () => {
    const client = await signInAs(investorA);
    const {data, error} = await client
      .from('platform_settings')
      .select('key')
      .eq('key', 'invite_validity_days');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('anónimo NÃO lê settings', async () => {
    const {data, error} = await anonClient()
      .from('platform_settings')
      .select('key');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('investidor NÃO escreve settings', async () => {
    const client = await signInAs(investorA);
    await client
      .from('platform_settings')
      .update({value: 999 as unknown as object})
      .eq('key', 'invite_validity_days');
    const {data} = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'invite_validity_days')
      .single();
    expect(data!.value).toBe(14);
  });
});

describe('audit_log (append-only)', () => {
  it('investidor NÃO lê o audit log', async () => {
    const client = await signInAs(investorA);
    const {data, error} = await client.from('audit_log').select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('UPDATE é rejeitado mesmo com service role', async () => {
    const {data: inserted, error: insertError} = await admin
      .from('audit_log')
      .insert({action: 'test', entity_type: 'test', payload: {}})
      .select('id')
      .single();
    expect(insertError).toBeNull();

    const {error} = await admin
      .from('audit_log')
      .update({action: 'tampered'})
      .eq('id', inserted!.id);
    expect(error).not.toBeNull();
  });

  it('DELETE é rejeitado mesmo com service role', async () => {
    const {data: inserted} = await admin
      .from('audit_log')
      .insert({action: 'test-del', entity_type: 'test', payload: {}})
      .select('id')
      .single();

    const {error} = await admin.from('audit_log').delete().eq('id', inserted!.id);
    expect(error).not.toBeNull();
  });

  it('alterações a profiles ficam registadas no audit log', async () => {
    await admin.from('profiles').update({preferred_locale: 'en'}).eq('id', idB);
    const {data} = await admin
      .from('audit_log')
      .select('action, entity_type, entity_id')
      .eq('entity_type', 'profiles')
      .eq('entity_id', idB)
      .eq('action', 'update');
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});
