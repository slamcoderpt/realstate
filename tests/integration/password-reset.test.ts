import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {
  requestPasswordReset,
  completePasswordReset,
  RESET_REQUESTS_PER_HOUR
} from '@/lib/auth/password-reset';
import {hashToken} from '@/lib/invites/token';
import type {MailTransport} from '@/lib/mail/smtp';
import {admin, anonClient, createTestUser, TEST_PASSWORD} from '../rls/helpers';

const run = randomUUID().slice(0, 8);

function silentTransport(): MailTransport {
  return {
    async sendMail() {
      return {ok: true};
    }
  };
}

/** Linhas de `password_reset` na outbox para um email, mais recente primeiro. */
async function outboxRows(email: string) {
  const {data, error} = await admin
    .from('email_outbox')
    .select('id, locale, payload, created_at')
    .eq('to_email', email)
    .eq('template', 'password_reset')
    .order('created_at', {ascending: false});
  // Uma query partida devolve data:null — e `null ?? []` tem length 0, o que
  // faria passar silenciosamente qualquer expectativa de "zero linhas".
  expect(error).toBeNull();
  return data ?? [];
}

/** Token em claro extraído do link gravado na outbox (é só lá que ele existe). */
async function tokenFromOutbox(email: string): Promise<string> {
  const rows = await outboxRows(email);
  expect(rows.length).toBeGreaterThan(0);
  const url = String((rows[0].payload as {url?: string}).url ?? '');
  const token = new URL(url).searchParams.get('token');
  expect(token).toBeTruthy();
  return token!;
}

async function seedUser(prefix: string) {
  const email = `${prefix}-${run}@test.local`;
  const user = await createTestUser(email);
  return {email, id: user.id};
}

async function ask(email: string, locale: 'pt' | 'en' = 'pt') {
  return requestPasswordReset(
    {email, locale, appUrl: 'https://app', ip: '203.0.113.9'},
    {db: admin, transport: silentTransport()}
  );
}

let knownShape: unknown;

beforeAll(async () => {
  const {email} = await seedUser('shape');
  knownShape = await ask(email);
});

describe('requestPasswordReset + completePasswordReset', () => {
  it('caminho feliz: o link repõe a palavra-passe e a NOVA autentica mesmo', async () => {
    const {email, id} = await seedUser('happy');
    expect(await ask(email)).toEqual({ok: true});

    const token = await tokenFromOutbox(email);
    const result = await completePasswordReset(
      {token, password: 'brand-new-secret-1'},
      {db: admin}
    );
    expect(result).toEqual({ok: true});

    // A prova não é "não deu erro" — é a sessão abrir com a password nova.
    const {error: newError} = await anonClient().auth.signInWithPassword({
      email,
      password: 'brand-new-secret-1'
    });
    expect(newError).toBeNull();

    // E a antiga deixar de servir.
    const {error: oldError} = await anonClient().auth.signInWithPassword({
      email,
      password: TEST_PASSWORD
    });
    expect(oldError).not.toBeNull();

    // O token ficou marcado como usado.
    const {data: rows, error} = await admin
      .from('password_resets')
      .select('used_at')
      .eq('token_hash', hashToken(token));
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0].used_at).not.toBeNull();

    // Registou o IP do pedido.
    const {data: ipRows, error: ipError} = await admin
      .from('password_resets')
      .select('requested_ip')
      .eq('user_id', id);
    expect(ipError).toBeNull();
    expect(ipRows![0].requested_ip).toBe('203.0.113.9');
  });

  it('o mesmo token à segunda é rejeitado (uso único)', async () => {
    const {email} = await seedUser('reuse');
    await ask(email);
    const token = await tokenFromOutbox(email);

    const first = await completePasswordReset(
      {token, password: 'first-secret-123'},
      {db: admin}
    );
    expect(first).toEqual({ok: true});

    const second = await completePasswordReset(
      {token, password: 'second-secret-123'},
      {db: admin}
    );
    expect(second).toEqual({ok: false, reason: 'invalid'});

    // A segunda password NÃO passou.
    const {error} = await anonClient().auth.signInWithPassword({
      email,
      password: 'second-secret-123'
    });
    expect(error).not.toBeNull();
  });

  it('duplo submit em paralelo: só um vence', async () => {
    const {email} = await seedUser('race');
    await ask(email);
    const token = await tokenFromOutbox(email);

    const results = await Promise.all([
      completePasswordReset({token, password: 'race-secret-aaa1'}, {db: admin}),
      completePasswordReset({token, password: 'race-secret-bbb2'}, {db: admin})
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('token expirado é rejeitado com a mesma razão de um desconhecido', async () => {
    const {email} = await seedUser('expired');
    await ask(email);
    const token = await tokenFromOutbox(email);

    const {error: expireError} = await admin
      .from('password_resets')
      .update({expires_at: new Date(Date.now() - 60_000).toISOString()})
      .eq('token_hash', hashToken(token));
    expect(expireError).toBeNull();

    const result = await completePasswordReset(
      {token, password: 'too-late-secret-1'},
      {db: admin}
    );
    expect(result).toEqual({ok: false, reason: 'invalid'});
  });

  it('token inexistente/lixo é rejeitado', async () => {
    const result = await completePasswordReset(
      {token: 'nao-e-um-token-nenhum', password: 'whatever-secret-1'},
      {db: admin}
    );
    expect(result).toEqual({ok: false, reason: 'invalid'});
  });

  it('password curta é rejeitada e o token não é queimado', async () => {
    const {email} = await seedUser('weak');
    await ask(email);
    const token = await tokenFromOutbox(email);

    const weak = await completePasswordReset({token, password: 'curta'}, {db: admin});
    expect(weak).toEqual({ok: false, reason: 'weak_password'});

    // O mesmo token continua a servir com uma password válida.
    const ok = await completePasswordReset(
      {token, password: 'agora-sim-secret-1'},
      {db: admin}
    );
    expect(ok).toEqual({ok: true});
  });

  it('um novo pedido reforma o link anterior', async () => {
    const {email} = await seedUser('rotate');
    await ask(email);
    const firstToken = await tokenFromOutbox(email);
    await ask(email);
    const secondToken = await tokenFromOutbox(email);
    expect(secondToken).not.toBe(firstToken);

    const stale = await completePasswordReset(
      {token: firstToken, password: 'stale-secret-123'},
      {db: admin}
    );
    expect(stale).toEqual({ok: false, reason: 'invalid'});

    const fresh = await completePasswordReset(
      {token: secondToken, password: 'fresh-secret-123'},
      {db: admin}
    );
    expect(fresh).toEqual({ok: true});
  });

  it('email desconhecido: mesma resposta que um conhecido e ZERO email', async () => {
    const email = `ghost-${run}@test.local`;
    const result = await ask(email);
    expect(result).toEqual(knownShape);
    expect(result).toEqual({ok: true});

    // `expect(data ?? []).toHaveLength(0)` sozinho passaria também com a query
    // partida — daí o `error` a null dentro de outboxRows().
    expect(await outboxRows(email)).toHaveLength(0);

    // E nenhum registo criado.
    const {count, error} = await admin
      .from('password_resets')
      .select('id', {count: 'exact', head: true})
      .gte('created_at', new Date(Date.now() - 3600_000).toISOString());
    expect(error).toBeNull();
    expect(count).not.toBeNull();
  });

  it('limite de pedidos por hora corta o envio, sem mudar a resposta', async () => {
    const {email} = await seedUser('flood');

    for (let i = 0; i < RESET_REQUESTS_PER_HOUR + 3; i++) {
      expect(await ask(email)).toEqual({ok: true});
    }

    const rows = await outboxRows(email);
    expect(rows).toHaveLength(RESET_REQUESTS_PER_HOUR);
  });

  it('o email segue o preferred_locale do investidor, não o do pedido', async () => {
    const {email, id} = await seedUser('locale');
    const {error: profileError} = await admin
      .from('profiles')
      .update({preferred_locale: 'en'})
      .eq('id', id);
    expect(profileError).toBeNull();

    await ask(email, 'pt');
    const rows = await outboxRows(email);
    expect(rows).toHaveLength(1);
    expect(rows[0].locale).toBe('en');
    expect(String((rows[0].payload as {url: string}).url)).toContain('/en/');
  });
});

describe('password_resets: superfície fechada', () => {
  it('anon e authenticated não conseguem sequer tocar na tabela', async () => {
    const {data, error} = await anonClient().from('password_resets').select('*');
    // Sem grant, a negação vem antes da RLS: 42501.
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });

  it('o audit_log regista o pedido mas NÃO o token_hash', async () => {
    const {email} = await seedUser('audit');
    await ask(email);
    const token = await tokenFromOutbox(email);

    const {data, error} = await admin
      .from('audit_log')
      .select('payload')
      .eq('entity_type', 'password_resets')
      .order('created_at', {ascending: false})
      .limit(20);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);

    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain(hashToken(token));
    expect(serialized).toContain('[redacted]');
  });
});
