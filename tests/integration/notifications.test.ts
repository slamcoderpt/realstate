import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createTestUser} from '../rls/helpers';
import {
  createNotification,
  listNotifications,
  countUnread,
  markAllRead
} from '@/lib/notifications/service';

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser(`notif-svc-${randomUUID().slice(0, 8)}@test.local`)).id;
});

describe('serviço de notificações', () => {
  it('cria, lista e conta não-lidas', async () => {
    const u = (await createTestUser(`n1-${randomUUID().slice(0, 8)}@test.local`)).id;
    await createNotification({
      userId: u,
      type: 'statement',
      payload: {projectName: 'Campelos', period: '2026-07'},
      href: '/projetos/x/extratos'
    });
    const rows = await listNotifications(u);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('statement');
    expect(rows[0].payload.projectName).toBe('Campelos');
    expect(await countUnread(u)).toBe(1);
  });

  it('markAllRead zera a contagem e é idempotente', async () => {
    const u = (await createTestUser(`n2-${randomUUID().slice(0, 8)}@test.local`)).id;
    await createNotification({userId: u, type: 'kyc_approved', payload: {}});
    await createNotification({userId: u, type: 'kyc_approved', payload: {}});
    expect(await countUnread(u)).toBe(2);
    await markAllRead(u);
    expect(await countUnread(u)).toBe(0);
    await markAllRead(u);
    expect(await countUnread(u)).toBe(0);
  });

  it('markAllRead NÃO toca nas notificações de outro utilizador', async () => {
    const a = (await createTestUser(`n3-${randomUUID().slice(0, 8)}@test.local`)).id;
    const b = (await createTestUser(`n4-${randomUUID().slice(0, 8)}@test.local`)).id;
    await createNotification({userId: a, type: 'kyc_approved', payload: {}});
    await createNotification({userId: b, type: 'kyc_approved', payload: {}});
    await markAllRead(a);
    expect(await countUnread(b)).toBe(1);
  });

  it('listNotifications ordena da mais recente para a mais antiga', async () => {
    const u = (await createTestUser(`n5-${randomUUID().slice(0, 8)}@test.local`)).id;
    await createNotification({userId: u, type: 'kyc_approved', payload: {n: 1}});
    await createNotification({userId: u, type: 'kyc_rejected', payload: {n: 2}});
    const rows = await listNotifications(u);
    expect(rows[0].payload.n).toBe(2);
  });

  void userId;
});
