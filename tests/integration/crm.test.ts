import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createTestUser} from '../rls/helpers';
import {
  createLead,
  updateLead,
  moveLeadStage,
  addActivity,
  listLeads,
  getLeadDetail
} from '@/lib/crm/service';

let staffId: string;

beforeAll(async () => {
  staffId = (await createTestUser(`crm-staff-${randomUUID().slice(0, 8)}@test.local`, 'admin')).id;
});

function email(): string {
  return `lead-${randomUUID().slice(0, 8)}@test.local`;
}

describe('createLead / listLeads', () => {
  it('cria um lead em `novo` com os defaults e lista-o', async () => {
    const {id} = await createLead({
      fullName: 'Ana Prospect',
      email: email(),
      estimatedTicket: 25000,
      createdBy: staffId
    });
    expect(id).toBeTruthy();

    const detail = await getLeadDetail(id);
    expect(detail!.lead.stage).toBe('novo');
    expect(detail!.lead.estimated_ticket).toBe(25000);
    // Sem owner explícito, o criador fica responsável.
    expect(detail!.lead.owner_id).toBe(staffId);

    const rows = await listLeads();
    expect(rows.some((l) => l.id === id)).toBe(true);
  });

  it('normaliza o email para minúsculas', async () => {
    const {id} = await createLead({
      fullName: 'B',
      email: 'MixedCase@Test.Local',
      createdBy: staffId
    });
    const detail = await getLeadDetail(id);
    expect(detail!.lead.email).toBe('mixedcase@test.local');
  });
});

describe('moveLeadStage', () => {
  it('muda o estado e regista uma atividade de mudança', async () => {
    const {id} = await createLead({fullName: 'C', email: email(), createdBy: staffId});
    await moveLeadStage(id, 'qualificado', staffId);

    const detail = await getLeadDetail(id);
    expect(detail!.lead.stage).toBe('qualificado');
    const change = detail!.activities.find((a) => a.type === 'mudanca_estado');
    expect(change).toBeTruthy();
    expect(change!.body).toBe('novo → qualificado');
  });

  it('mover para o mesmo estado é no-op (sem atividade)', async () => {
    const {id} = await createLead({fullName: 'D', email: email(), createdBy: staffId});
    await moveLeadStage(id, 'novo', staffId);
    const detail = await getLeadDetail(id);
    expect(detail!.activities).toHaveLength(0);
  });
});

describe('addActivity', () => {
  it('regista uma nota e atualiza o last_activity_at', async () => {
    const {id} = await createLead({fullName: 'E', email: email(), createdBy: staffId});
    const before = (await getLeadDetail(id))!.lead.last_activity_at;
    await new Promise((r) => setTimeout(r, 5));
    await addActivity(id, {type: 'chamada', body: 'Ligação inicial'}, staffId);

    const detail = await getLeadDetail(id);
    expect(detail!.activities.some((a) => a.body === 'Ligação inicial')).toBe(true);
    expect(new Date(detail!.lead.last_activity_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime()
    );
  });
});

describe('updateLead', () => {
  it('atualiza campos de qualificação', async () => {
    const {id} = await createLead({fullName: 'F', email: email(), createdBy: staffId});
    await updateLead(id, {investorProfile: 'qualificado', estimatedTicket: 50000});
    const detail = await getLeadDetail(id);
    expect(detail!.lead.investor_profile).toBe('qualificado');
    expect(detail!.lead.estimated_ticket).toBe(50000);
  });
});
