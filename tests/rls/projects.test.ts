import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {
  admin,
  createTestUser,
  signInAs,
  expectAnonCannotRead
} from './helpers';

const run = randomUUID().slice(0, 8);
const investor = `proj-inv-${run}@test.local`;
const staff = `proj-staff-${run}@test.local`;

let prepId: string; // projeto em preparacao (invisível ao investidor)
let subId: string; // projeto em subscricao (visível)

beforeAll(async () => {
  await createTestUser(investor);
  await createTestUser(staff, 'admin');

  const {data: prep, error: e1} = await admin
    .from('projects')
    .insert({
      name: 'Projeto Preparação',
      location: 'Braga',
      status: 'preparacao',
      acquisition_cost: 100000,
      works_budget: 50000,
      arv: 200000,
      total_amount: 150000,
      estimated_irr: 15,
      term_months: 9
    })
    .select('id')
    .single();
  if (e1) throw e1;
  prepId = prep.id;

  const {data: sub, error: e2} = await admin
    .from('projects')
    .insert({
      name: 'Projeto Subscrição',
      location: 'Porto',
      status: 'subscricao',
      acquisition_cost: 120000,
      works_budget: 48000,
      arv: 245000,
      total_amount: 150000,
      estimated_irr: 21,
      term_months: 9
    })
    .select('id')
    .single();
  if (e2) throw e2;
  subId = sub.id;

  await admin.from('project_budget_lines').insert({
    project_id: subId,
    name: 'Demolições',
    phase: 'Preparação',
    budget_amount: 3200,
    sort_order: 1
  });
});

describe('projects RLS', () => {
  it('investidor vê projetos em subscricao', async () => {
    const client = await signInAs(investor);
    const {data, error} = await client
      .from('projects')
      .select('id')
      .eq('id', subId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO vê projetos em preparacao', async () => {
    const client = await signInAs(investor);
    const {data, error} = await client
      .from('projects')
      .select('id')
      .eq('id', prepId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('staff vê todos os projetos', async () => {
    const client = await signInAs(staff);
    const {data, error} = await client
      .from('projects')
      .select('id')
      .in('id', [prepId, subId]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it('investidor NÃO consegue escrever projetos', async () => {
    const client = await signInAs(investor);
    await client.from('projects').update({name: 'HACK'}).eq('id', subId);
    const {data} = await admin
      .from('projects')
      .select('name')
      .eq('id', subId)
      .single();
    expect(data!.name).toBe('Projeto Subscrição');
  });

  it('anónimo não vê projetos', async () => {
    await expectAnonCannotRead('projects');
  });
});

describe('project_budget_lines RLS', () => {
  it('investidor vê rubricas de um projeto visível', async () => {
    const client = await signInAs(investor);
    const {data, error} = await client
      .from('project_budget_lines')
      .select('id')
      .eq('project_id', subId);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });

  it('investidor NÃO vê rubricas de um projeto em preparacao', async () => {
    await admin.from('project_budget_lines').insert({
      project_id: prepId,
      name: 'Secreta',
      phase: 'X',
      budget_amount: 1,
      sort_order: 1
    });
    const client = await signInAs(investor);
    const {data} = await client
      .from('project_budget_lines')
      .select('id')
      .eq('project_id', prepId);
    expect(data ?? []).toHaveLength(0);
  });
});
