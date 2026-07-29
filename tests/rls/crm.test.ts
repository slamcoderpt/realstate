import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {
  admin,
  createTestUser,
  signInAs,
  expectAnonCannotRead
} from './helpers';

const run = randomUUID().slice(0, 8);
const investor = `crm-inv-${run}@test.local`;
const staff = `crm-staff-${run}@test.local`;

let leadId: string;
let activityId: string;

beforeAll(async () => {
  await createTestUser(investor);
  const s = await createTestUser(staff, 'admin');

  const {data: lead, error} = await admin
    .from('crm_leads')
    .insert({
      full_name: 'Prospecto RLS',
      email: `rls-${run}@test.local`,
      created_by: s.id,
      owner_id: s.id
    })
    .select('id')
    .single();
  if (error) throw error;
  leadId = lead.id;

  const {data: act, error: ae} = await admin
    .from('crm_activities')
    .insert({lead_id: leadId, author_id: s.id, type: 'nota', body: 'Interno'})
    .select('id')
    .single();
  if (ae) throw ae;
  activityId = act.id;
});

describe('crm_leads RLS', () => {
  it('staff lê leads', async () => {
    const c = await signInAs(staff);
    const {data, error} = await c.from('crm_leads').select('id').eq('id', leadId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO vê leads', async () => {
    const c = await signInAs(investor);
    const {data, error} = await c.from('crm_leads').select('id').eq('id', leadId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('investidor NÃO escreve leads (sem grant/política)', async () => {
    const c = await signInAs(investor);
    await c.from('crm_leads').update({full_name: 'HACK'}).eq('id', leadId);
    const {data} = await admin
      .from('crm_leads')
      .select('full_name')
      .eq('id', leadId)
      .single();
    expect(data!.full_name).toBe('Prospecto RLS');
  });

  it('anónimo não vê leads', async () => {
    await expectAnonCannotRead('crm_leads');
  });
});

describe('crm_activities RLS', () => {
  it('staff lê atividades', async () => {
    const c = await signInAs(staff);
    const {data} = await c.from('crm_activities').select('id').eq('id', activityId);
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO vê atividades', async () => {
    const c = await signInAs(investor);
    const {data, error} = await c
      .from('crm_activities')
      .select('id')
      .eq('id', activityId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('anónimo não vê atividades', async () => {
    await expectAnonCannotRead('crm_activities');
  });
});
