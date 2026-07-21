import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {
  admin,
  createTestUser,
  signInAs,
  expectAnonCannotRead
} from './helpers';

const run = randomUUID().slice(0, 8);
const invA = `sub-a-${run}@test.local`;
const invB = `sub-b-${run}@test.local`;
const staff = `sub-staff-${run}@test.local`;

let idA: string;
let projectId: string;
let subAId: string;

beforeAll(async () => {
  idA = (await createTestUser(invA)).id;
  await createTestUser(invB);
  await createTestUser(staff, 'admin');

  const {data: p, error: pe} = await admin
    .from('projects')
    .insert({
      name: 'Proj Sub',
      location: 'Porto',
      status: 'subscricao',
      total_amount: 150000,
      estimated_irr: 20,
      term_months: 9
    })
    .select('id')
    .single();
  if (pe) throw pe;
  projectId = p.id;

  const {data: s, error: se} = await admin
    .from('subscriptions')
    .insert({
      project_id: projectId,
      user_id: idA,
      amount: 20000,
      status: 'interesse',
      consent_given: true,
      terms_version: 'v1'
    })
    .select('id')
    .single();
  if (se) throw se;
  subAId = s.id;
});

describe('subscriptions RLS', () => {
  it('investidor lê a sua própria subscrição', async () => {
    const c = await signInAs(invA);
    const {data, error} = await c
      .from('subscriptions')
      .select('id')
      .eq('id', subAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO lê a subscrição de outro', async () => {
    const c = await signInAs(invB);
    const {data, error} = await c
      .from('subscriptions')
      .select('id')
      .eq('id', subAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('staff lê todas as subscrições', async () => {
    const c = await signInAs(staff);
    const {data, error} = await c
      .from('subscriptions')
      .select('id')
      .eq('id', subAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO escreve subscrições (sem grant/política)', async () => {
    const c = await signInAs(invA);
    await c.from('subscriptions').update({amount: 999999}).eq('id', subAId);
    const {data} = await admin
      .from('subscriptions')
      .select('amount')
      .eq('id', subAId)
      .single();
    expect(Number(data!.amount)).toBe(20000);
  });

  it('anónimo não vê subscrições', async () => {
    await expectAnonCannotRead('subscriptions');
  });
});

describe('projects RLS alargada por subscrição', () => {
  it('investidor com subscrição vê o projeto mesmo fora de subscricao', async () => {
    await admin.from('projects').update({status: 'em_curso'}).eq('id', projectId);
    const c = await signInAs(invA);
    const {data} = await c.from('projects').select('id').eq('id', projectId);
    expect(data).toHaveLength(1);
    await admin
      .from('projects')
      .update({status: 'subscricao'})
      .eq('id', projectId);
  });

  it('investidor SEM subscrição não vê um projeto em em_curso', async () => {
    await admin.from('projects').update({status: 'em_curso'}).eq('id', projectId);
    const c = await signInAs(invB);
    const {data} = await c.from('projects').select('id').eq('id', projectId);
    expect(data ?? []).toHaveLength(0);
    await admin
      .from('projects')
      .update({status: 'subscricao'})
      .eq('id', projectId);
  });
});
