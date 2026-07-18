import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createInvite, revokeInvite, resendInvite} from '@/lib/invites/service';
import type {MailTransport} from '@/lib/mail/smtp';
import {hashToken} from '@/lib/invites/token';
import {admin, createTestUser} from '../rls/helpers';

const run = randomUUID().slice(0, 8);
let actorId: string;

/** Captura o link de convite enviado (para extrair o token em claro). */
function capturingTransport() {
  const sent: Array<{to: string; html: string}> = [];
  const transport: MailTransport = {
    async sendMail({to, html}) {
      sent.push({to, html});
      return {ok: true};
    }
  };
  return {transport, sent};
}

beforeAll(async () => {
  const adminUser = await createTestUser(`svc-adm-${run}@test.local`, 'admin');
  actorId = adminUser.id;
});

describe('createInvite', () => {
  it('grava convite com invited_by e envia email com o token em claro', async () => {
    const {transport, sent} = capturingTransport();
    const email = `conv-${run}@test.local`;
    const result = await createInvite(
      {
        fullName: 'Investidor Novo',
        email: email.toUpperCase(), // deve ser normalizado para minúsculas
        locale: 'pt',
        actorId,
        appUrl: 'https://app.tilweni.pt'
      },
      {db: admin, transport}
    );

    expect(result.emailSent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email); // normalizado

    // O token em claro vai no link; na BD só existe o hash.
    const match = sent[0].html.match(/aceitar-convite\/([A-Za-z0-9_-]+)/);
    expect(match).not.toBeNull();
    const rawToken = match![1];

    const {data: invite} = await admin
      .from('invites')
      .select('email, invited_by, status, token_hash')
      .eq('id', result.id)
      .single();
    expect(invite!.email).toBe(email);
    expect(invite!.invited_by).toBe(actorId);
    expect(invite!.status).toBe('pending');
    expect(invite!.token_hash).toBe(hashToken(rawToken));
    expect(invite!.token_hash).not.toBe(rawToken);
  });

  it('o audit_log regista o autor do convite (invited_by no payload)', async () => {
    const {transport} = capturingTransport();
    const result = await createInvite(
      {
        fullName: 'Auditado',
        email: `audit-${run}@test.local`,
        locale: 'pt',
        actorId,
        appUrl: 'https://app.tilweni.pt'
      },
      {db: admin, transport}
    );

    const {data: logs} = await admin
      .from('audit_log')
      .select('action, entity_type, payload')
      .eq('entity_type', 'invites')
      .eq('entity_id', result.id)
      .eq('action', 'insert');
    expect(logs!.length).toBeGreaterThanOrEqual(1);
    expect(logs![0].payload.new.invited_by).toBe(actorId);
  });
});

describe('revokeInvite', () => {
  it('marca pendente como revogado', async () => {
    const {transport} = capturingTransport();
    const {id} = await createInvite(
      {
        fullName: 'A Revogar',
        email: `rev-${run}@test.local`,
        locale: 'pt',
        actorId,
        appUrl: 'https://app.tilweni.pt'
      },
      {db: admin, transport}
    );
    await revokeInvite(id, {db: admin});
    const {data} = await admin
      .from('invites')
      .select('status')
      .eq('id', id)
      .single();
    expect(data!.status).toBe('revoked');
  });
});

describe('resendInvite', () => {
  it('gera token novo (invalida o anterior) e reenvia', async () => {
    const first = capturingTransport();
    const {id} = await createInvite(
      {
        fullName: 'A Reenviar',
        email: `res-${run}@test.local`,
        locale: 'pt',
        actorId,
        appUrl: 'https://app.tilweni.pt'
      },
      {db: admin, transport: first.transport}
    );
    const {data: before} = await admin
      .from('invites')
      .select('token_hash')
      .eq('id', id)
      .single();

    const second = capturingTransport();
    const result = await resendInvite(
      {id, locale: 'pt', appUrl: 'https://app.tilweni.pt'},
      {db: admin, transport: second.transport}
    );
    expect(result.emailSent).toBe(true);

    const {data: after} = await admin
      .from('invites')
      .select('token_hash, status')
      .eq('id', id)
      .single();
    expect(after!.token_hash).not.toBe(before!.token_hash); // token rodado
    expect(after!.status).toBe('pending');
  });
});
