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

/**
 * Cria um investidor com uma subscrição no estado pedido e devolve o email —
 * é por email que os testes contam linhas na `email_outbox`. Contar por
 * `template` seria uma tautologia: a tabela nunca é truncada entre execuções,
 * logo já traz linhas de corridas anteriores.
 */
async function subscriberOn(
  projectId: string,
  status: 'fundos_confirmados' | 'interesse'
): Promise<{id: string; email: string}> {
  const email = `obra-svc-${randomUUID().slice(0, 8)}@test.local`;
  const u = await createTestUser(email);
  const {error} = await admin.from('subscriptions').insert({
    project_id: projectId,
    user_id: u.id,
    amount: 20000,
    status,
    consent_given: true,
    terms_version: 'v1'
  });
  if (error) throw error;
  return {id: u.id, email};
}

async function outboxFor(email: string, template: string): Promise<number> {
  const {data, error} = await admin
    .from('email_outbox')
    .select('id')
    .eq('to_email', email)
    .eq('template', template);
  expect(error).toBeNull();
  return (data ?? []).length;
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
    const confirmed = await subscriberOn(projectId, 'fundos_confirmados');
    // Subscrição ativa mas SEM fundos: vê a obra, não recebe notificação.
    const interested = await subscriberOn(projectId, 'interesse');
    const {id} = await publishWorkUpdate(
      {projectId, title: 'Semana 1', body: 'Arranque da obra', createdBy: staffId, locale: 'pt'},
      noopMail
    );
    expect(id).toBeTruthy();
    const feed = await listWorkUpdates(projectId);
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe('Semana 1');
    // Exatamente um email para o confirmado e NENHUM para o interessado.
    expect(await outboxFor(confirmed.email, 'work_update_published')).toBe(1);
    expect(await outboxFor(interested.email, 'work_update_published')).toBe(0);

    // In-app além do email, e só para quem tem fundos confirmados.
    const {data: notifs, error: notifErr} = await admin
      .from('notifications')
      .select('user_id, type')
      .eq('type', 'work_update')
      .eq('user_id', confirmed.id);
    expect(notifErr).toBeNull();
    expect(notifs).toHaveLength(1);

    const {data: naoConfirmado} = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', interested.id);
    expect(naoConfirmado ?? []).toHaveLength(0);
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
    // O alerta vai para um email de staff fixo, logo o `to_email` não distingue
    // esta execução das anteriores — o nome único da rubrica (que viaja no
    // payload) é o que torna a contagem exata possível.
    const lineName = `Cobertura-${randomUUID().slice(0, 8)}`;
    const {data: line} = await admin
      .from('project_budget_lines')
      .insert({project_id: projectId, name: lineName, phase: 'Obra', budget_amount: 10000, sort_order: 1})
      .select('id')
      .single();
    // limiar default = 10% → 12000 é +20% ⇒ alerta
    await setActualAmount(line!.id, 12000, {locale: 'pt'}, noopMail);
    const {data: mails, error} = await admin
      .from('email_outbox')
      .select('id')
      .eq('template', 'budget_deviation_alert')
      .eq('payload->>lineName', lineName);
    expect(error).toBeNull();
    expect(mails ?? []).toHaveLength(1);
  });
});
