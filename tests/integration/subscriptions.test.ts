import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {
  manifestInterest,
  transitionSubscription,
  cancelSubscription,
  getMySubscription,
  listProjectSubscriptions
} from '@/lib/subscriptions/service';

const run = randomUUID().slice(0, 8);
let staffId: string;

async function makeProject(status = 'subscricao'): Promise<string> {
  const {data, error} = await admin
    .from('projects')
    .insert({
      name: `P-${randomUUID().slice(0, 6)}`,
      location: 'X',
      status,
      total_amount: 200000,
      estimated_irr: 18,
      term_months: 10
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function freshInvestor(): Promise<string> {
  const u = await createTestUser(`sub-svc-${randomUUID().slice(0, 8)}@test.local`);
  // manifestInterest exige KYC aprovado.
  await admin.from('profiles').update({kyc_status: 'approved'}).eq('id', u.id);
  return u.id;
}

const noopMail = {transport: {sendMail: async () => ({})}};

beforeAll(async () => {
  staffId = (await createTestUser(`sub-rev-${run}@test.local`, 'admin')).id;
});

describe('manifestInterest', () => {
  it('cria subscrição em interesse (respeitando o mínimo)', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    const {id} = await manifestInterest(
      {userId, projectId, amount: 20000, consentVersion: 'v1'},
      noopMail
    );
    expect(id).toBeTruthy();
    const mine = await getMySubscription(userId, projectId);
    expect(mine!.status).toBe('interesse');
    expect(mine!.amount).toBe(20000);
  });

  it('rejeita montante abaixo do mínimo', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    await expect(
      manifestInterest(
        {userId, projectId, amount: 100, consentVersion: 'v1'},
        noopMail
      )
    ).rejects.toThrow(/mínimo|minimo/i);
  });

  it('rejeita segunda subscrição ativa no mesmo projeto', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    await manifestInterest(
      {userId, projectId, amount: 20000, consentVersion: 'v1'},
      noopMail
    );
    await expect(
      manifestInterest(
        {userId, projectId, amount: 30000, consentVersion: 'v1'},
        noopMail
      )
    ).rejects.toThrow();
  });

  it('rejeita manifestação num projeto que não está em subscricao', async () => {
    const projectId = await makeProject('preparacao');
    const userId = await freshInvestor();
    await expect(
      manifestInterest(
        {userId, projectId, amount: 20000, consentVersion: 'v1'},
        noopMail
      )
    ).rejects.toThrow(/subscri/i);
  });
});

describe('transitionSubscription + agregados', () => {
  it('confirmar fundos recomputa subscribed_amount/investor_count', async () => {
    const projectId = await makeProject();
    const u1 = await freshInvestor();
    const u2 = await freshInvestor();
    const {id: s1} = await manifestInterest(
      {userId: u1, projectId, amount: 20000, consentVersion: 'v1'},
      noopMail
    );
    const {id: s2} = await manifestInterest(
      {userId: u2, projectId, amount: 30000, consentVersion: 'v1'},
      noopMail
    );
    await transitionSubscription({id: s1, to: 'contrato_assinado', reviewerId: staffId, locale: 'pt'}, noopMail);
    await transitionSubscription({id: s1, to: 'fundos_confirmados', reviewerId: staffId, locale: 'pt'}, noopMail);
    const {data: proj} = await admin
      .from('projects')
      .select('subscribed_amount, investor_count')
      .eq('id', projectId)
      .single();
    expect(Number(proj!.subscribed_amount)).toBe(20000);
    expect(proj!.investor_count).toBe(1);
    void s2;
  });

  it('rejeita transição inválida', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    const {id} = await manifestInterest(
      {userId, projectId, amount: 20000, consentVersion: 'v1'},
      noopMail
    );
    await expect(
      transitionSubscription({id, to: 'fundos_confirmados', reviewerId: staffId, locale: 'pt'}, noopMail)
    ).rejects.toThrow(/transição|transicao/i);
  });

  it('respeita max_investors_per_project quando definido', async () => {
    const projectId = await makeProject();
    await admin.from('platform_settings').update({value: 1}).eq('key', 'max_investors_per_project');
    try {
      const u1 = await freshInvestor();
      const u2 = await freshInvestor();
      const {id: s1} = await manifestInterest({userId: u1, projectId, amount: 20000, consentVersion: 'v1'}, noopMail);
      const {id: s2} = await manifestInterest({userId: u2, projectId, amount: 20000, consentVersion: 'v1'}, noopMail);
      await transitionSubscription({id: s1, to: 'contrato_assinado', reviewerId: staffId, locale: 'pt'}, noopMail);
      await transitionSubscription({id: s1, to: 'fundos_confirmados', reviewerId: staffId, locale: 'pt'}, noopMail);
      await transitionSubscription({id: s2, to: 'contrato_assinado', reviewerId: staffId, locale: 'pt'}, noopMail);
      await expect(
        transitionSubscription({id: s2, to: 'fundos_confirmados', reviewerId: staffId, locale: 'pt'}, noopMail)
      ).rejects.toThrow(/limite|max/i);
    } finally {
      await admin.from('platform_settings').update({value: null}).eq('key', 'max_investors_per_project');
    }
  });
});

describe('cancelSubscription', () => {
  it('o dono cancela a sua manifestação de interesse', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    const {id} = await manifestInterest({userId, projectId, amount: 20000, consentVersion: 'v1'}, noopMail);
    await cancelSubscription({id, byUserId: userId, isStaff: false});
    const mine = await getMySubscription(userId, projectId);
    expect(mine).toBeNull();
  });
});

describe('listProjectSubscriptions', () => {
  it('lista as subscrições de um projeto (staff)', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    await manifestInterest({userId, projectId, amount: 20000, consentVersion: 'v1'}, noopMail);
    const rows = await listProjectSubscriptions(projectId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].amount).toBe(20000);
  });
});
