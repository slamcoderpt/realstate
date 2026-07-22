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
const dono = `notif-dono-${run}@test.local`;
const outro = `notif-outro-${run}@test.local`;
const staff = `notif-staff-${run}@test.local`;

let donoId: string;
let notifId: string;

beforeAll(async () => {
  donoId = (await createTestUser(dono)).id;
  await createTestUser(outro);
  await createTestUser(staff, 'admin');

  const {data, error} = await admin
    .from('notifications')
    .insert({
      user_id: donoId,
      type: 'work_update',
      payload: {projectName: 'Campelos', updateTitle: 'Semana 1'},
      href: '/projetos/x/obra'
    })
    .select('id')
    .single();
  if (error) throw error;
  notifId = data.id;
});

describe('notifications RLS', () => {
  it('o dono lê a sua notificação', async () => {
    const c = await signInAs(dono);
    const {data, error} = await c
      .from('notifications')
      .select('id, type, payload')
      .eq('id', notifId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].type).toBe('work_update');
  });

  it('outro investidor NÃO lê a notificação alheia', async () => {
    const c = await signInAs(outro);
    await expectRowHidden(c, 'notifications', notifId);
  });

  // Notificações são pessoais: nem o staff as lê. O back-office não tem
  // nenhuma vista de "notificações de X", e dar-lhe leitura seria alargar o
  // acesso a dados pessoais sem caso de uso.
  it('staff NÃO lê notificações de investidores', async () => {
    const c = await signInAs(staff);
    await expectRowHidden(c, 'notifications', notifId);
  });

  it('anónimo não lê nada', async () => {
    await expectAnonCannotRead('notifications');
  });

  it('o dono NÃO consegue marcar como lida por escrita direta', async () => {
    // Marcar como lida passa por Server Action com service role, como todas as
    // escritas deste repo. Sem grant de UPDATE, falha antes da RLS.
    const c = await signInAs(dono);
    await c
      .from('notifications')
      .update({read_at: new Date().toISOString()})
      .eq('id', notifId);
    const {data} = await admin
      .from('notifications')
      .select('read_at')
      .eq('id', notifId)
      .single();
    expect(data!.read_at).toBeNull();
  });
});
