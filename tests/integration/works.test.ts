import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {
  addMilestone,
  updateMilestone,
  listMilestones,
  publishWorkUpdate,
  listWorkUpdates,
  setActualAmount
} from '@/lib/works/service';

let staffId: string;
const noopMail = {transport: {sendMail: async () => ({})}};

async function makeProject(): Promise<string> {
  const {data, error} = await admin
    .from('projects')
    .insert({
      name: `Obra-${randomUUID().slice(0, 6)}`,
      location: 'X',
      status: 'em_curso',
      total_amount: 100000,
      estimated_irr: 15,
      term_months: 8
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function funderOn(projectId: string): Promise<string> {
  const u = await createTestUser(`obra-svc-${randomUUID().slice(0, 8)}@test.local`);
  const {error} = await admin.from('subscriptions').insert({
    project_id: projectId,
    user_id: u.id,
    amount: 20000,
    status: 'fundos_confirmados',
    consent_given: true,
    terms_version: 'v1'
  });
  if (error) throw error;
  return u.id;
}

beforeAll(async () => {
  staffId = (await createTestUser(`obra-staff-${randomUUID().slice(0, 8)}@test.local`, 'admin')).id;
});

describe('marcos', () => {
  it('adiciona e atualiza um marco', async () => {
    const projectId = await makeProject();
    const {id} = await addMilestone(projectId, {
      title: 'Demolições',
      plannedDate: '2026-08-01'
    });
    await updateMilestone(id, {status: 'concluido', actualDate: '2026-08-05'});
    const rows = await listMilestones(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('concluido');
    expect(rows[0].actual_date).toBe('2026-08-05');
  });
});

describe('publishWorkUpdate', () => {
  it('publica e notifica só investidores com fundos confirmados', async () => {
    const projectId = await makeProject();
    await funderOn(projectId);
    const {id} = await publishWorkUpdate(
      {projectId, title: 'Semana 1', body: 'Arranque da obra', createdBy: staffId, locale: 'pt'},
      noopMail
    );
    expect(id).toBeTruthy();
    const feed = await listWorkUpdates(projectId);
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe('Semana 1');
    // Um email na outbox para o investidor confirmado.
    const {data: mails} = await admin
      .from('email_outbox')
      .select('template')
      .eq('template', 'work_update_published');
    expect((mails ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

describe('setActualAmount', () => {
  it('grava o custo real na rubrica', async () => {
    const projectId = await makeProject();
    const {data: line, error} = await admin
      .from('project_budget_lines')
      .insert({project_id: projectId, name: 'Estrutura', phase: 'Obra', budget_amount: 10000, sort_order: 1})
      .select('id')
      .single();
    if (error) throw error;
    await setActualAmount(line.id, 9000, {locale: 'pt'}, noopMail);
    const {data: after} = await admin
      .from('project_budget_lines')
      .select('actual_amount')
      .eq('id', line.id)
      .single();
    expect(Number(after!.actual_amount)).toBe(9000);
  });

  it('dispara alerta de desvio acima do limiar', async () => {
    const projectId = await makeProject();
    const {data: line} = await admin
      .from('project_budget_lines')
      .insert({project_id: projectId, name: 'Cobertura', phase: 'Obra', budget_amount: 10000, sort_order: 1})
      .select('id')
      .single();
    // limiar default = 10% → 12000 é +20% ⇒ alerta
    await setActualAmount(line!.id, 12000, {locale: 'pt'}, noopMail);
    const {data: mails} = await admin
      .from('email_outbox')
      .select('template')
      .eq('template', 'budget_deviation_alert');
    expect((mails ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
