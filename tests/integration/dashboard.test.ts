import {describe, it, expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {getInvestorDashboard} from '@/lib/dashboard/service';
import type {SubscriptionStatus} from '@/lib/subscriptions/states';

/**
 * Área do investidor (spec 5.7). O serviço corre com service role — logo
 * BYPASSA a RLS — e é aqui que as duas regras de produto se aguentam:
 *
 *  1. capital investido conta APENAS `fundos_confirmados`. Mostrar dinheiro
 *     como investido antes de estar transferido é uma falsidade material.
 *  2. obra vê-se com subscrição ativa; extratos SÓ com fundos confirmados —
 *     a mesma assimetria que a RLS impõe (has_active_subscription vs
 *     has_confirmed_subscription).
 */

type ProjectRef = {id: string; name: string};

async function makeProject(status = 'em_curso', irr = 15): Promise<ProjectRef> {
  const name = `Dash-${randomUUID().slice(0, 8)}`;
  const {data, error} = await admin
    .from('projects')
    .insert({
      name,
      location: 'Lisboa',
      status,
      total_amount: 200000,
      estimated_irr: irr,
      term_months: 12
    })
    .select('id')
    .single();
  if (error) throw error;
  return {id: data.id, name};
}

async function newInvestor(): Promise<string> {
  const u = await createTestUser(`dash-${randomUUID().slice(0, 8)}@test.local`);
  return u.id;
}

async function subscribe(
  userId: string,
  projectId: string,
  amount: number,
  status: SubscriptionStatus
): Promise<void> {
  const {error} = await admin.from('subscriptions').insert({
    project_id: projectId,
    user_id: userId,
    amount,
    status,
    consent_given: true,
    terms_version: 'v1'
  });
  if (error) throw error;
}

async function addMilestone(
  projectId: string,
  title: string,
  plannedDate: string | null,
  status: 'previsto' | 'em_curso' | 'concluido' = 'previsto'
): Promise<void> {
  const {error} = await admin.from('project_milestones').insert({
    project_id: projectId,
    title,
    planned_date: plannedDate,
    status,
    sort_order: 1
  });
  if (error) throw error;
}

async function addUpdate(
  projectId: string,
  title: string,
  publishedAt: string
): Promise<void> {
  const {error} = await admin.from('work_updates').insert({
    project_id: projectId,
    title,
    body: 'corpo',
    published_at: publishedAt
  });
  if (error) throw error;
}

async function addStatement(
  projectId: string,
  period: string,
  publishedAt?: string
): Promise<void> {
  const {error} = await admin.from('account_statements').insert({
    project_id: projectId,
    period,
    version: 1,
    storage_path: `${projectId}/${period}/v1.pdf`,
    original_filename: 'extrato.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024,
    ...(publishedAt ? {published_at: publishedAt} : {})
  });
  if (error) throw error;
}

describe('getInvestorDashboard — capital investido', () => {
  it('soma apenas fundos_confirmados, nunca o interesse manifestado', async () => {
    const userId = await newInvestor();
    const confirmado = await makeProject();
    const interesse = await makeProject();
    await subscribe(userId, confirmado.id, 20000, 'fundos_confirmados');
    await subscribe(userId, interesse.id, 30000, 'interesse');

    const dash = await getInvestorDashboard(userId);

    // 20000 e NÃO 50000: o interesse ainda não é dinheiro na conta.
    expect(dash.investedTotal).toBe(20000);
  });

  it('devolve tudo vazio para quem ainda não tem posições', async () => {
    const userId = await newInvestor();
    const dash = await getInvestorDashboard(userId);
    expect(dash.investedTotal).toBe(0);
    expect(dash.positions).toHaveLength(0);
    expect(dash.upcomingMilestones).toHaveLength(0);
    expect(dash.latestUpdates).toHaveLength(0);
    expect(dash.recentStatements).toHaveLength(0);
  });
});

describe('getInvestorDashboard — posições', () => {
  it('lista interesse e fundos confirmados, exclui canceladas', async () => {
    const userId = await newInvestor();
    const confirmado = await makeProject('em_curso', 12);
    const interesse = await makeProject('subscricao', 9);
    const cancelado = await makeProject();
    await subscribe(userId, confirmado.id, 20000, 'fundos_confirmados');
    await subscribe(userId, interesse.id, 30000, 'interesse');
    await subscribe(userId, cancelado.id, 10000, 'cancelada');

    const dash = await getInvestorDashboard(userId);

    expect(dash.positions).toHaveLength(2);
    const byName = new Map(dash.positions.map((p) => [p.projectName, p]));
    expect(byName.get(confirmado.name)).toMatchObject({
      projectId: confirmado.id,
      projectStatus: 'em_curso',
      amount: 20000,
      status: 'fundos_confirmados',
      estimatedIrr: 12
    });
    expect(byName.get(interesse.name)).toMatchObject({
      amount: 30000,
      status: 'interesse',
      estimatedIrr: 9
    });
    expect(byName.has(cancelado.name)).toBe(false);

    // Numéricos normalizados: o PostgREST serializa `numeric` como string.
    for (const p of dash.positions) {
      expect(typeof p.amount).toBe('number');
      expect(typeof p.estimatedIrr).toBe('number');
    }
  });
});

describe('getInvestorDashboard — isolamento entre investidores', () => {
  it('nada do projeto de outro investidor entra na área desta pessoa', async () => {
    const mine = await newInvestor();
    const meuProjeto = await makeProject();
    await subscribe(mine, meuProjeto.id, 15000, 'fundos_confirmados');

    const outro = await newInvestor();
    const projetoAlheio = await makeProject();
    await subscribe(outro, projetoAlheio.id, 99000, 'fundos_confirmados');
    await addMilestone(projetoAlheio.id, 'Marco alheio', '2026-09-01');
    await addUpdate(projetoAlheio.id, 'Atualização alheia', '2026-08-01T10:00:00Z');
    await addStatement(projetoAlheio.id, '2026-08');

    const dash = await getInvestorDashboard(mine);

    expect(dash.investedTotal).toBe(15000);
    expect(dash.positions.map((p) => p.projectId)).toEqual([meuProjeto.id]);
    expect(dash.upcomingMilestones.map((m) => m.projectId)).not.toContain(
      projetoAlheio.id
    );
    expect(dash.latestUpdates.map((u) => u.projectId)).not.toContain(
      projetoAlheio.id
    );
    expect(dash.recentStatements.map((s) => s.projectName)).not.toContain(
      projetoAlheio.name
    );
    // E nada de nada: este utilizador só tem o projeto dele, que está vazio.
    expect(dash.upcomingMilestones).toHaveLength(0);
    expect(dash.latestUpdates).toHaveLength(0);
    expect(dash.recentStatements).toHaveLength(0);
  });
});

describe('getInvestorDashboard — próximos marcos', () => {
  it('exclui concluídos e ordena por data prevista ascendente', async () => {
    const userId = await newInvestor();
    const projeto = await makeProject();
    await subscribe(userId, projeto.id, 10000, 'fundos_confirmados');
    await addMilestone(projeto.id, 'Acabamentos', '2026-11-01');
    await addMilestone(projeto.id, 'Estrutura', '2026-09-01');
    await addMilestone(projeto.id, 'Demolições', '2026-08-01', 'concluido');

    const dash = await getInvestorDashboard(userId);

    expect(dash.upcomingMilestones.map((m) => m.title)).toEqual([
      'Estrutura',
      'Acabamentos'
    ]);
    expect(dash.upcomingMilestones[0].projectName).toBe(projeto.name);
  });
});

describe('getInvestorDashboard — atualizações de obra', () => {
  it('vêm da mais recente para a mais antiga', async () => {
    const userId = await newInvestor();
    const projeto = await makeProject();
    // Obra: basta subscrição ativa, não é preciso ter fundos confirmados.
    await subscribe(userId, projeto.id, 10000, 'interesse');
    await addUpdate(projeto.id, 'Semana 1', '2026-08-01T10:00:00Z');
    await addUpdate(projeto.id, 'Semana 3', '2026-08-15T10:00:00Z');
    await addUpdate(projeto.id, 'Semana 2', '2026-08-08T10:00:00Z');

    const dash = await getInvestorDashboard(userId);

    expect(dash.latestUpdates.map((u) => u.title)).toEqual([
      'Semana 3',
      'Semana 2',
      'Semana 1'
    ]);
    expect(dash.latestUpdates[0].projectName).toBe(projeto.name);
  });
});

describe('getInvestorDashboard — extratos', () => {
  it('só de projetos onde os fundos estão confirmados', async () => {
    const userId = await newInvestor();
    const confirmado = await makeProject();
    const interesse = await makeProject();
    await subscribe(userId, confirmado.id, 20000, 'fundos_confirmados');
    await subscribe(userId, interesse.id, 30000, 'interesse');
    await addStatement(confirmado.id, '2026-07', '2026-08-01T10:00:00Z');
    // Subscrição ativa mas sem fundos: NÃO pode ver o extrato da conta que
    // detém o dinheiro dos investidores.
    await addStatement(interesse.id, '2026-07', '2026-08-02T10:00:00Z');

    const dash = await getInvestorDashboard(userId);

    expect(dash.recentStatements).toHaveLength(1);
    expect(dash.recentStatements[0]).toMatchObject({
      projectName: confirmado.name,
      period: '2026-07'
    });
    expect(dash.recentStatements.map((s) => s.projectName)).not.toContain(
      interesse.name
    );

    // A obra do mesmo projeto SEM fundos confirmados continua visível: é a
    // assimetria deliberada entre acompanhamento e registo financeiro.
    await addUpdate(interesse.id, 'Obra visível', '2026-08-02T10:00:00Z');
    const depois = await getInvestorDashboard(userId);
    expect(depois.latestUpdates.map((u) => u.projectId)).toContain(interesse.id);
  });
});
