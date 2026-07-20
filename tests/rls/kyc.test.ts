import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser, signInAs, anonClient} from './helpers';

const run = randomUUID().slice(0, 8);
const investorA = `kyc-a-${run}@test.local`;
const investorB = `kyc-b-${run}@test.local`;
const staff = `kyc-staff-${run}@test.local`;

let idA: string;
let idB: string;
let subA: string;

beforeAll(async () => {
  idA = (await createTestUser(investorA)).id;
  idB = (await createTestUser(investorB)).id;
  await createTestUser(staff, 'admin');

  // Submissão do investidor A, criada com service role (como fará a Server Action).
  const {data, error} = await admin
    .from('kyc_submissions')
    .insert({
      user_id: idA,
      citizen_type: 'pt',
      nif: '123456789',
      full_name: 'Investidor A',
      consent_given: true,
      consent_version: 'v1'
    })
    .select('id')
    .single();
  if (error) throw error;
  subA = data.id;

  await admin.from('kyc_documents').insert({
    submission_id: subA,
    doc_type: 'cartao_cidadao',
    storage_path: `${idA}/${subA}/cartao_cidadao.pdf`,
    original_filename: 'cc.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1234
  });
});

describe('kyc_submissions RLS', () => {
  it('investidor lê a sua própria submissão', async () => {
    const client = await signInAs(investorA);
    const {data, error} = await client
      .from('kyc_submissions')
      .select('id')
      .eq('id', subA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO lê a submissão de outro', async () => {
    const client = await signInAs(investorB);
    const {data, error} = await client
      .from('kyc_submissions')
      .select('id')
      .eq('id', subA);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('staff lê submissões de qualquer investidor', async () => {
    const client = await signInAs(staff);
    const {data, error} = await client
      .from('kyc_submissions')
      .select('id')
      .eq('id', subA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO consegue aprovar-se a si próprio (update bloqueado)', async () => {
    const client = await signInAs(investorA);
    await client
      .from('kyc_submissions')
      .update({status: 'approved'})
      .eq('id', subA);
    const {data} = await admin
      .from('kyc_submissions')
      .select('status')
      .eq('id', subA)
      .single();
    expect(data!.status).toBe('submitted');
  });

  it('anónimo NÃO lê submissões', async () => {
    const {data, error} = await anonClient()
      .from('kyc_submissions')
      .select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe('kyc_documents RLS', () => {
  it('investidor NÃO lê metadados de documentos de outro', async () => {
    const client = await signInAs(investorB);
    const {data, error} = await client
      .from('kyc_documents')
      .select('id')
      .eq('submission_id', subA);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('staff lê metadados de documentos', async () => {
    const client = await signInAs(staff);
    const {data, error} = await client
      .from('kyc_documents')
      .select('id')
      .eq('submission_id', subA);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});

describe('kyc bucket de Storage', () => {
  it('é privado', async () => {
    const {data} = await admin.storage.getBucket('kyc');
    expect(data?.public).toBe(false);
  });

  it('investidor autenticado NÃO lista objetos do bucket kyc diretamente', async () => {
    // Storage sem políticas permissivas: só o service role acede. Um cliente
    // autenticado não deve conseguir listar/descarregar.
    const client = await signInAs(investorA);
    const {data} = await client.storage.from('kyc').list(idA);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('kyc alimenta o audit_log', () => {
  it('aprovar/rejeitar uma submissão fica registado', async () => {
    await admin
      .from('kyc_submissions')
      .update({status: 'approved', reviewed_at: new Date().toISOString()})
      .eq('id', subA);
    const {data} = await admin
      .from('audit_log')
      .select('action')
      .eq('entity_type', 'kyc_submissions')
      .eq('entity_id', subA)
      .eq('action', 'update');
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});
