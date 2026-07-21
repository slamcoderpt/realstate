import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {
  admin,
  createTestUser,
  signInAs,
  expectAnonCannotRead
} from './helpers';

const run = randomUUID().slice(0, 8);
const investor = `inv-${run}@test.local`;
const adminUser = `adm-${run}@test.local`;

let inviteId: string;

beforeAll(async () => {
  await createTestUser(investor);
  await createTestUser(adminUser, 'admin');

  // Semear um convite com service role (bypassa RLS — é o caminho legítimo).
  const {data, error} = await admin
    .from('invites')
    .insert({
      full_name: 'Convidado Teste',
      email: `convidado-${run}@test.local`,
      token_hash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
      expires_at: new Date(Date.now() + 14 * 864e5).toISOString()
    })
    .select('id')
    .single();
  if (error) throw error;
  inviteId = data!.id;

  const {error: mailErr} = await admin.from('email_outbox').insert({
    to_email: `convidado-${run}@test.local`,
    to_name: 'Convidado Teste',
    template: 'invite',
    payload: {run}
  });
  if (mailErr) throw mailErr;
});

describe('invites (RLS)', () => {
  it('investidor NÃO lê convites', async () => {
    const client = await signInAs(investor);
    const {data, error} = await client.from('invites').select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS filtra silenciosamente
  });

  it('anónimo NÃO lê convites', async () => {
    await expectAnonCannotRead('invites');
  });

  it('admin lê convites', async () => {
    const client = await signInAs(adminUser);
    const {data, error} = await client.from('invites').select('id').eq('id', inviteId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO consegue escrever um convite', async () => {
    const client = await signInAs(investor);
    await client.from('invites').insert({
      full_name: 'Auto-convite',
      email: `hacker-${run}@test.local`,
      token_hash: 'x'.repeat(64),
      expires_at: new Date(Date.now() + 864e5).toISOString()
    });
    // Confirma via admin que nada foi inserido para este email.
    const {data} = await admin
      .from('invites')
      .select('id')
      .eq('email', `hacker-${run}@test.local`);
    expect(data).toHaveLength(0);
  });

  it('alterações a invites ficam no audit log', async () => {
    await admin.from('invites').update({status: 'revoked'}).eq('id', inviteId);
    const {data} = await admin
      .from('audit_log')
      .select('action')
      .eq('entity_type', 'invites')
      .eq('entity_id', inviteId)
      .eq('action', 'update');
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});

describe('email_outbox (RLS)', () => {
  it('investidor NÃO lê a fila de email', async () => {
    const client = await signInAs(investor);
    const {data, error} = await client.from('email_outbox').select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('anónimo NÃO lê a fila de email', async () => {
    await expectAnonCannotRead('email_outbox');
  });

  it('admin lê a fila de email', async () => {
    const client = await signInAs(adminUser);
    const {data, error} = await client.from('email_outbox').select('id');
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
