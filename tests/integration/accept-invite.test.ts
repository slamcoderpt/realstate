import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createInvite} from '@/lib/invites/service';
import {acceptInvite} from '@/lib/invites/accept';
import type {MailTransport} from '@/lib/mail/smtp';
import {admin, createTestUser, anonClient} from '../rls/helpers';

const run = randomUUID().slice(0, 8);
let actorId: string;

function capturingTransport() {
  const sent: string[] = [];
  const transport: MailTransport = {
    async sendMail({html}) {
      sent.push(html);
      return {ok: true};
    }
  };
  return {transport, sent};
}

/** Cria um convite e devolve {id, token, email}. */
async function seedInvite(email: string) {
  const {transport, sent} = capturingTransport();
  const {id} = await createInvite(
    {fullName: 'Convidado', email, locale: 'pt', actorId, appUrl: 'https://app'},
    {db: admin, transport}
  );
  const token = sent[0].match(/aceitar-convite\/([A-Za-z0-9_-]+)/)![1];
  return {id, token, email};
}

beforeAll(async () => {
  const a = await createTestUser(`acc-adm-${run}@test.local`, 'admin');
  actorId = a.id;
});

describe('acceptInvite', () => {
  it('cria conta, regista IP/termos, invalida o token e permite login', async () => {
    const email = `accept-${run}@test.local`;
    const {id, token} = await seedInvite(email);
    const {transport} = capturingTransport();

    const result = await acceptInvite(
      {
        token,
        password: 'super-secret-123',
        locale: 'pt',
        acceptedIp: '203.0.113.7',
        appUrl: 'https://app'
      },
      {db: admin, transport}
    );
    expect(result.ok).toBe(true);

    const {data: invite} = await admin
      .from('invites')
      .select('status, accepted_ip, accepted_at, terms_version')
      .eq('id', id)
      .single();
    expect(invite!.status).toBe('accepted');
    expect(invite!.accepted_ip).toBe('203.0.113.7');
    expect(invite!.accepted_at).not.toBeNull();
    expect(invite!.terms_version).toBeTruthy();

    // A conta existe e a password funciona.
    const client = anonClient();
    const {error} = await client.auth.signInWithPassword({
      email,
      password: 'super-secret-123'
    });
    expect(error).toBeNull();
  });

  it('segundo uso do mesmo token é rejeitado (invalid)', async () => {
    const email = `reuse-${run}@test.local`;
    const {token} = await seedInvite(email);
    const {transport} = capturingTransport();

    const first = await acceptInvite(
      {token, password: 'first-secret-123', locale: 'pt', appUrl: 'https://app'},
      {db: admin, transport}
    );
    expect(first.ok).toBe(true);

    const second = await acceptInvite(
      {token, password: 'second-secret-123', locale: 'pt', appUrl: 'https://app'},
      {db: admin, transport}
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('invalid');
  });

  it('password fraca é rejeitada sem criar conta', async () => {
    const email = `weak-${run}@test.local`;
    const {token} = await seedInvite(email);
    const {transport} = capturingTransport();

    const result = await acceptInvite(
      {token, password: 'short', locale: 'pt', appUrl: 'https://app'},
      {db: admin, transport}
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('weak_password');

    // O convite permanece pendente.
    const {data} = await admin
      .from('invites')
      .select('status')
      .eq('email', email)
      .single();
    expect(data!.status).toBe('pending');
  });
});
