import {describe, it, expect, beforeAll, vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';

/**
 * `audit_log.ip` chega mesmo à base de dados (spec Fase A §4: "Campos: ator,
 * ação, entidade, payload JSONB, IP, timestamp").
 *
 * É o route handler REAL de /api/statements/[id] que corre: o pedido é forjado
 * (com `x-forwarded-for`), o resto — leitura do extrato, gate de acesso, insert
 * no audit_log, assinatura da URL — é o código de produção contra o Postgres e
 * o Storage locais. A única coisa substituída é `getSession()`, que depende dos
 * cookies do Next e não tem equivalente fora de um pedido HTTP real; um teste
 * que substituísse mais do que isso deixaria de provar que a rota grava o IP.
 */

let sessionRole = 'admin';
let sessionUserId = '';

vi.mock('@/lib/auth/staff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/staff')>();
  return {
    ...actual,
    getSession: async () => ({
      userId: sessionUserId,
      email: 'audit-ip@test.local',
      role: sessionRole
    })
  };
});

const {GET} = await import('@/app/api/statements/[id]/route');
const {publishStatement} = await import('@/lib/statements/service');

const noopMail = {transport: {sendMail: async () => ({})}};
let statementId: string;

function pdf(): File {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return new File([bytes], 'extrato.pdf', {type: 'application/pdf'});
}

async function call(headers: Record<string, string>): Promise<Response> {
  return GET(new Request(`http://localhost/api/statements/${statementId}`, {headers}), {
    params: Promise.resolve({id: statementId})
  });
}

/** Última linha de auditoria desta consulta. */
async function lastAudit(): Promise<{ip: string | null; actor_id: string}> {
  const {data, error} = await admin
    .from('audit_log')
    .select('ip, actor_id')
    .eq('entity_type', 'account_statements')
    .eq('entity_id', statementId)
    .order('id', {ascending: false})
    .limit(1);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  return data![0];
}

beforeAll(async () => {
  sessionUserId = (
    await createTestUser(`audit-ip-${randomUUID().slice(0, 8)}@test.local`, 'admin')
  ).id;

  const {data, error} = await admin
    .from('projects')
    .insert({
      name: `AuditIp-${randomUUID().slice(0, 6)}`,
      location: 'Porto',
      status: 'em_curso',
      total_amount: 100000,
      estimated_irr: 15,
      term_months: 8
    })
    .select('id')
    .single();
  if (error) throw error;

  const published = await publishStatement(
    {
      projectId: data.id,
      period: '2026-07',
      file: pdf(),
      publishedBy: sessionUserId,
      locale: 'pt'
    },
    noopMail
  );
  statementId = published.id;
});

describe('audit_log.ip na consulta de um extrato', () => {
  it('grava a primeira entrada de x-forwarded-for', async () => {
    const res = await call({'x-forwarded-for': '203.0.113.9, 70.41.3.18'});
    // 3xx com Location = a rota chegou ao fim e emitiu a URL assinada.
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toBeTruthy();

    const row = await lastAudit();
    expect(row.ip).toBe('203.0.113.9');
    expect(row.actor_id).toBe(sessionUserId);
  });

  it('cai para x-real-ip', async () => {
    await call({'x-real-ip': '198.51.100.4'});
    expect((await lastAudit()).ip).toBe('198.51.100.4');
  });

  // Ausência regista-se como ausência: a alternativa (string vazia) rebentaria
  // o insert na coluna `inet` e, sendo fail-closed, negaria o download.
  it('sem cabeçalhos de proxy grava NULL e serve na mesma', async () => {
    const res = await call({});
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect((await lastAudit()).ip).toBeNull();
  });
});

/**
 * O `auditor` (leitura read-only sobre extratos) NÃO tem isenção de auditoria:
 * a rota deixa-o passar por `canReadStatements` e grava-lhe a consulta com IP
 * como a qualquer outro ator. Este é também o único teste que exercita o gate
 * da rota — a RLS cobre a base de dados, isto cobre o handler.
 */
describe('auditor na rota', () => {
  it('recebe a URL assinada e fica registado com IP', async () => {
    const auditorId = (
      await createTestUser(`audit-ip-aud-${randomUUID().slice(0, 8)}@test.local`, 'auditor')
    ).id;
    const previous = {role: sessionRole, id: sessionUserId};
    sessionRole = 'auditor';
    sessionUserId = auditorId;
    try {
      const res = await call({'x-forwarded-for': '192.0.2.55'});
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const row = await lastAudit();
      expect(row.actor_id).toBe(auditorId);
      expect(row.ip).toBe('192.0.2.55');
    } finally {
      sessionRole = previous.role;
      sessionUserId = previous.id;
    }
  });
});

/**
 * O outro lado da decisão documentada em
 * 20260721130000_audit_ip_documenta_trigger.sql: as linhas escritas pelo
 * trigger `audit_row_change()` têm ip NULL por construção — não há pedido HTTP
 * dentro da transação. Se algum dia alguém "corrigir" isso com um valor
 * inventado, este teste cai.
 */
describe('linhas escritas pelo trigger', () => {
  it('não têm IP (o trigger corre sem contexto de pedido)', async () => {
    const {data, error} = await admin
      .from('audit_log')
      .select('ip')
      .eq('entity_type', 'account_statements')
      .eq('entity_id', statementId)
      .eq('action', 'insert');
    expect(error).toBeNull();
    expect(data).toHaveLength(1); // controlo positivo: o trigger disparou
    expect(data![0].ip).toBeNull();
  });
});
