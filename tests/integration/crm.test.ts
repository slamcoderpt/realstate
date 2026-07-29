import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createTestUser} from '../rls/helpers';
import {
  createLead,
  updateLead,
  moveLeadStage,
  addActivity,
  listLeads,
  getLeadDetail,
  convertLeadToInvite,
  linkConvertedInvite,
  listPendingFollowups,
  markActivityDone
} from '@/lib/crm/service';
import {admin} from '../rls/helpers';

let staffId: string;
const noop = {transport: {sendMail: async () => ({})}};
const APP_URL = 'http://localhost:3000';

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

describe('follow-ups', () => {
  it('lista follow-ups pendentes e conclui-os', async () => {
    const {id} = await createLead({fullName: 'Follow', email: email(), createdBy: staffId});
    const {id: actId} = await addActivity(
      id,
      {type: 'chamada', body: 'Ligar amanhã', dueAt: '2026-08-01T09:00:00Z'},
      staffId
    );

    const pending = await listPendingFollowups();
    const mine = pending.find((f) => f.id === actId);
    expect(mine).toBeTruthy();
    expect(mine!.leadName).toBe('Follow');

    await markActivityDone(actId);
    const after = await listPendingFollowups();
    expect(after.some((f) => f.id === actId)).toBe(false);
  });

  it('atividade sem data não aparece nos follow-ups', async () => {
    const {id} = await createLead({fullName: 'NoDue', email: email(), createdBy: staffId});
    const {id: actId} = await addActivity(id, {type: 'nota', body: 'Só nota'}, staffId);
    const pending = await listPendingFollowups();
    expect(pending.some((f) => f.id === actId)).toBe(false);
  });
});

describe('tags', () => {
  it('atualiza as tags do lead', async () => {
    const {id} = await createLead({fullName: 'Tagged', email: email(), createdBy: staffId});
    await updateLead(id, {tags: ['vip', 'lisboa']});
    const detail = await getLeadDetail(id);
    expect(detail!.lead.tags).toEqual(['vip', 'lisboa']);
  });
});

describe('convertLeadToInvite', () => {
  it('cria um convite novo e liga-o ao lead (estado convite_enviado)', async () => {
    const {id} = await createLead({fullName: 'Convert', email: email(), createdBy: staffId});
    const res = await convertLeadToInvite(
      id,
      {locale: 'pt', actorId: staffId, appUrl: APP_URL},
      noop
    );
    expect(res.status).toBe('invited');

    const detail = await getLeadDetail(id);
    expect(detail!.lead.stage).toBe('convite_enviado');
    expect(detail!.lead.converted_invite_id).toBeTruthy();
    // O convite existe na tabela invites.
    if (res.status === 'invited') {
      const {data} = await admin
        .from('invites')
        .select('email, status')
        .eq('id', res.inviteId)
        .single();
      expect(data!.status).toBe('pending');
    }
  });

  it('reutiliza um convite pendente já existente para o mesmo email', async () => {
    const mail = email();
    const a = await createLead({fullName: 'A', email: mail, createdBy: staffId});
    const first = await convertLeadToInvite(
      a.id,
      {locale: 'pt', actorId: staffId, appUrl: APP_URL},
      noop
    );
    expect(first.status).toBe('invited');

    // Um segundo lead com o mesmo email reaproveita o convite pendente.
    const b = await createLead({fullName: 'B', email: mail, createdBy: staffId});
    const second = await convertLeadToInvite(
      b.id,
      {locale: 'pt', actorId: staffId, appUrl: APP_URL},
      noop
    );
    expect(second.status).toBe('reused_invite');
    if (first.status === 'invited' && second.status === 'reused_invite') {
      expect(second.inviteId).toBe(first.inviteId);
    }
  });

  it('liga a um utilizador já registado (status already_user)', async () => {
    const mail = `crm-existing-${randomUUID().slice(0, 8)}@test.local`;
    const {data: created} = await admin.auth.admin.createUser({
      email: mail,
      password: 'existing-123',
      email_confirm: true
    });
    const {id} = await createLead({fullName: 'Exist', email: mail, createdBy: staffId});
    const res = await convertLeadToInvite(
      id,
      {locale: 'pt', actorId: staffId, appUrl: APP_URL},
      noop
    );
    expect(res.status).toBe('already_user');
    const detail = await getLeadDetail(id);
    expect(detail!.lead.stage).toBe('convertido');
    expect(detail!.lead.converted_user_id).toBe(created?.user?.id);
  });

  it('é idempotente: um lead já convertido não recria', async () => {
    const mail = `crm-idem-${randomUUID().slice(0, 8)}@test.local`;
    await admin.auth.admin.createUser({
      email: mail,
      password: 'idem-1234',
      email_confirm: true
    });
    const {id} = await createLead({fullName: 'Idem', email: mail, createdBy: staffId});
    await convertLeadToInvite(id, {locale: 'pt', actorId: staffId, appUrl: APP_URL}, noop);
    const again = await convertLeadToInvite(
      id,
      {locale: 'pt', actorId: staffId, appUrl: APP_URL},
      noop
    );
    expect(again.status).toBe('already_converted');
  });
});

describe('linkConvertedInvite', () => {
  it('fecha o ciclo: liga o lead à conta e marca convertido', async () => {
    const {id} = await createLead({fullName: 'Loop', email: email(), createdBy: staffId});
    const res = await convertLeadToInvite(
      id,
      {locale: 'pt', actorId: staffId, appUrl: APP_URL},
      noop
    );
    expect(res.status).toBe('invited');
    if (res.status !== 'invited') return;

    const fakeUserId = staffId; // qualquer id de utilizador serve p/ o teste
    await linkConvertedInvite(res.inviteId, fakeUserId);

    const detail = await getLeadDetail(id);
    expect(detail!.lead.stage).toBe('convertido');
    expect(detail!.lead.converted_user_id).toBe(fakeUserId);
  });
});
