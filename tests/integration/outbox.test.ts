import {describe, it, expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {sendEmail} from '@/lib/mail/outbox';
import type {MailTransport} from '@/lib/mail/smtp';
import {admin} from '../rls/helpers';

const run = randomUUID().slice(0, 8);

/** Transport que regista as chamadas e opcionalmente falha. */
function mockTransport(opts: {fail?: string} = {}) {
  const calls: Array<{to: string; subject: string}> = [];
  const transport: MailTransport = {
    async sendMail({to, subject}) {
      calls.push({to, subject});
      if (opts.fail) throw new Error(opts.fail);
      return {messageId: 'mock'};
    }
  };
  return {transport, calls};
}

describe('sendEmail (outbox síncrona)', () => {
  it('envio com sucesso grava linha e marca sent', async () => {
    const {transport, calls} = mockTransport();
    const result = await sendEmail(
      {
        toEmail: `ok-${run}@test.local`,
        toName: 'Sucesso',
        locale: 'pt',
        template: 'invite',
        payload: {fullName: 'Sucesso', url: 'https://app/x', expiresAt: '31/07/2026'}
      },
      {transport, db: admin}
    );

    expect(result.sent).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe(`ok-${run}@test.local`);
    expect(calls[0].subject).toBe('O seu convite TILWENI');

    const {data} = await admin
      .from('email_outbox')
      .select('status, sent_at, to_email')
      .eq('id', result.id)
      .single();
    expect(data!.status).toBe('sent');
    expect(data!.sent_at).not.toBeNull();
  });

  it('falha de SMTP marca failed com last_error e NÃO lança', async () => {
    const {transport} = mockTransport({fail: 'SMTP 421 indisponível'});
    const result = await sendEmail(
      {
        toEmail: `fail-${run}@test.local`,
        locale: 'en',
        template: 'welcome',
        payload: {fullName: 'Falha', loginUrl: 'https://app/en/login'}
      },
      {transport, db: admin}
    );

    expect(result.sent).toBe(false);
    expect(result.error).toContain('SMTP 421');

    const {data} = await admin
      .from('email_outbox')
      .select('status, attempts, last_error')
      .eq('id', result.id)
      .single();
    expect(data!.status).toBe('failed');
    expect(data!.attempts).toBe(1);
    expect(data!.last_error).toContain('SMTP 421');
  });
});
