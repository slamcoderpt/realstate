import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {
  admin,
  createTestUser,
  signInAs,
  expectAnonCannotRead,
  expectRowHidden
} from './helpers';

const run = randomUUID().slice(0, 8);
const funder = `obra-funder-${run}@test.local`;
const interested = `obra-int-${run}@test.local`;
const cancelled = `obra-canc-${run}@test.local`;
const outsider = `obra-out-${run}@test.local`;
const staff = `obra-staff-${run}@test.local`;
const auditor = `obra-audit-${run}@test.local`;

let projectId: string;
let milestoneId: string;
let updateId: string;
let mediaId: string;
let statementId: string;
let subscriptionId: string;

async function sub(userId: string, status: string): Promise<string> {
  const {data, error} = await admin
    .from('subscriptions')
    .insert({
      project_id: projectId,
      user_id: userId,
      amount: 20000,
      status,
      consent_given: true,
      terms_version: 'v1'
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  const f = (await createTestUser(funder)).id;
  const i = (await createTestUser(interested)).id;
  const c = (await createTestUser(cancelled)).id;
  await createTestUser(outsider);
  await createTestUser(staff, 'admin');
  await createTestUser(auditor, 'auditor');

  const {data: p, error: pe} = await admin
    .from('projects')
    .insert({
      name: 'Obra RLS',
      location: 'Braga',
      status: 'em_curso',
      total_amount: 100000,
      estimated_irr: 15,
      term_months: 8
    })
    .select('id')
    .single();
  if (pe) throw pe;
  projectId = p.id;

  subscriptionId = await sub(f, 'fundos_confirmados');
  await sub(i, 'interesse');
  await sub(c, 'cancelada');

  const {data: m, error: me} = await admin
    .from('project_milestones')
    .insert({project_id: projectId, title: 'Demolições', status: 'concluido'})
    .select('id')
    .single();
  if (me) throw me;
  milestoneId = m.id;

  const {data: u, error: ue} = await admin
    .from('work_updates')
    .insert({project_id: projectId, title: 'Semana 1', body: 'Arranque'})
    .select('id')
    .single();
  if (ue) throw ue;
  updateId = u.id;

  const {data: md, error: mde} = await admin
    .from('work_update_media')
    .insert({
      work_update_id: updateId,
      storage_path: `${projectId}/foto-1.jpg`,
      media_type: 'photo',
      mime_type: 'image/jpeg',
      size_bytes: 2048
    })
    .select('id')
    .single();
  if (mde) throw mde;
  mediaId = md.id;

  const {data: s, error: se} = await admin
    .from('account_statements')
    .insert({
      project_id: projectId,
      period: '2026-07',
      storage_path: `${projectId}/2026-07-v1.pdf`,
      original_filename: 'extrato.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1234
    })
    .select('id')
    .single();
  if (se) throw se;
  statementId = s.id;
});

describe('obra: marcos e diário', () => {
  it('investidor com subscrição ativa vê marcos', async () => {
    const c = await signInAs(interested);
    const {data, error} = await c
      .from('project_milestones')
      .select('id')
      .eq('id', milestoneId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor sem subscrição NÃO vê marcos', async () => {
    const c = await signInAs(outsider);
    const {data, error} = await c
      .from('project_milestones')
      .select('id')
      .eq('id', milestoneId);
    // `error` null junto com zero linhas: sem isto, uma query partida (tabela
    // inexistente, coluna mudada) passaria por negação de RLS.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('investidor com subscrição ativa vê atualizações de obra', async () => {
    const c = await signInAs(interested);
    const {data} = await c.from('work_updates').select('id').eq('id', updateId);
    expect(data).toHaveLength(1);
  });

  it('investidor sem subscrição NÃO vê atualizações', async () => {
    const c = await signInAs(outsider);
    const {data, error} = await c.from('work_updates').select('id').eq('id', updateId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('investidor com subscrição ativa vê a media da atualização', async () => {
    const c = await signInAs(interested);
    const {data, error} = await c
      .from('work_update_media')
      .select('id')
      .eq('id', mediaId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor sem subscrição NÃO vê a media', async () => {
    const c = await signInAs(outsider);
    const {data, error} = await c
      .from('work_update_media')
      .select('id')
      .eq('id', mediaId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('staff vê tudo', async () => {
    const c = await signInAs(staff);
    const {data} = await c.from('work_updates').select('id').eq('id', updateId);
    expect(data).toHaveLength(1);
    const {data: media} = await c
      .from('work_update_media')
      .select('id')
      .eq('id', mediaId);
    expect(media).toHaveLength(1);
  });
});

/**
 * `has_active_subscription` exclui explicitamente `cancelada`. Sem estes testes,
 * apagar o `and s.status <> 'cancelada'` do helper não parte nada — e um
 * investidor que saiu do projeto mantinha acesso permanente à obra.
 */
describe('obra: subscrição cancelada perde o acesso', () => {
  it('NÃO vê marcos', async () => {
    const c = await signInAs(cancelled);
    const {data, error} = await c
      .from('project_milestones')
      .select('id')
      .eq('id', milestoneId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('NÃO vê atualizações de obra', async () => {
    const c = await signInAs(cancelled);
    const {data, error} = await c.from('work_updates').select('id').eq('id', updateId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('NÃO vê a media da obra', async () => {
    const c = await signInAs(cancelled);
    const {data, error} = await c
      .from('work_update_media')
      .select('id')
      .eq('id', mediaId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('NÃO vê extratos', async () => {
    const c = await signInAs(cancelled);
    const {data, error} = await c
      .from('account_statements')
      .select('id')
      .eq('id', statementId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

describe('extratos: só quem tem fundos confirmados', () => {
  it('investidor com fundos confirmados vê o extrato', async () => {
    const c = await signInAs(funder);
    const {data, error} = await c
      .from('account_statements')
      .select('id')
      .eq('id', statementId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor só com interesse NÃO vê o extrato', async () => {
    const c = await signInAs(interested);
    const {data, error} = await c
      .from('account_statements')
      .select('id')
      .eq('id', statementId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('staff vê o extrato', async () => {
    const c = await signInAs(staff);
    const {data} = await c
      .from('account_statements')
      .select('id')
      .eq('id', statementId);
    expect(data).toHaveLength(1);
  });

  it('anónimo não vê nada', async () => {
    await expectAnonCannotRead('account_statements');
    await expectAnonCannotRead('work_updates');
    await expectAnonCannotRead('work_update_media');
  });
});

/**
 * Spec Fase A §4: "`auditor` read-only sobre extratos e documentos fiscais".
 * O que interessa aqui é tanto o SIM como os NÃOs: o auditor lê extratos SEM
 * ter subscrição no projeto, mas isso não o torna staff — obra e subscrições
 * continuam fechadas. Sem os negativos, alargar `STAFF_ROLES` (a implementação
 * errada) passaria estes testes.
 */
describe('auditor: read-only sobre extratos, e só', () => {
  it('vê o extrato sem ter subscrição no projeto', async () => {
    const c = await signInAs(auditor);
    const {data, error} = await c
      .from('account_statements')
      .select('id')
      .eq('id', statementId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('NÃO vê marcos da obra', async () => {
    await expectRowHidden(await signInAs(auditor), 'project_milestones', milestoneId);
  });

  it('NÃO vê atualizações de obra', async () => {
    await expectRowHidden(await signInAs(auditor), 'work_updates', updateId);
  });

  it('NÃO vê a media da obra', async () => {
    await expectRowHidden(await signInAs(auditor), 'work_update_media', mediaId);
  });

  it('NÃO vê subscrições', async () => {
    await expectRowHidden(await signInAs(auditor), 'subscriptions', subscriptionId);
  });
});

describe('escrita bloqueada para investidores', () => {
  it('investidor NÃO escreve atualizações de obra', async () => {
    const c = await signInAs(funder);
    await c.from('work_updates').update({title: 'HACK'}).eq('id', updateId);
    const {data} = await admin
      .from('work_updates')
      .select('title')
      .eq('id', updateId)
      .single();
    expect(data!.title).toBe('Semana 1');
  });
});
