import {describe, it, expect} from 'vitest';
import {clientIp, clientIpFromHeaders} from '@/lib/auth/request';

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe('clientIpFromHeaders', () => {
  it('usa a PRIMEIRA entrada de x-forwarded-for (o cliente, não os proxies)', () => {
    expect(
      clientIpFromHeaders(h({'x-forwarded-for': '203.0.113.9, 70.41.3.18, 150.172.238.178'}))
    ).toBe('203.0.113.9');
  });

  it('tira espaços à volta', () => {
    expect(clientIpFromHeaders(h({'x-forwarded-for': '  203.0.113.9  , 70.41.3.18'}))).toBe(
      '203.0.113.9'
    );
  });

  it('cai para x-real-ip quando não há x-forwarded-for', () => {
    expect(clientIpFromHeaders(h({'x-real-ip': '198.51.100.4'}))).toBe('198.51.100.4');
  });

  // Um XFF vazio (ou só com vírgulas/espaços) é o caso que a versão anterior,
  // `split(',')[0]?.trim() ?? undefined`, devolvia como string vazia — que numa
  // coluna `inet` rebentaria o insert de auditoria em vez de gravar NULL.
  it('XFF vazio não engole o fallback nem devolve string vazia', () => {
    expect(clientIpFromHeaders(h({'x-forwarded-for': '', 'x-real-ip': '198.51.100.4'}))).toBe(
      '198.51.100.4'
    );
    expect(clientIpFromHeaders(h({'x-forwarded-for': '  ,  '}))).toBeNull();
  });

  it('null quando não há nenhum dos dois', () => {
    expect(clientIpFromHeaders(h({}))).toBeNull();
  });

  // `audit_log.ip` é `inet`: um valor mal formado rebenta o INSERT, e como a
  // rota dos extratos é fail-closed isso transformava um cabeçalho forjado (ou
  // um proxy mal configurado) num 500 em downloads legítimos.
  it('descarta valores que não são IPs', () => {
    expect(clientIpFromHeaders(h({'x-forwarded-for': 'not-an-ip'}))).toBeNull();
    expect(clientIpFromHeaders(h({'x-forwarded-for': '999.1.1.1'}))).toBeNull();
    expect(clientIpFromHeaders(h({'x-forwarded-for': '<script>'}))).toBeNull();
    expect(clientIpFromHeaders(h({'x-real-ip': 'localhost'}))).toBeNull();
  });

  it('um XFF inválido não impede o fallback para x-real-ip válido', () => {
    expect(
      clientIpFromHeaders(h({'x-forwarded-for': 'lixo', 'x-real-ip': '198.51.100.4'}))
    ).toBe('198.51.100.4');
  });

  it('aceita IPv6', () => {
    expect(clientIpFromHeaders(h({'x-forwarded-for': '2001:db8::1'}))).toBe('2001:db8::1');
    expect(clientIpFromHeaders(h({'x-real-ip': '::1'}))).toBe('::1');
    expect(clientIpFromHeaders(h({'x-real-ip': '::ffff:203.0.113.9'}))).toBe(
      '::ffff:203.0.113.9'
    );
  });
});

describe('clientIp(Request)', () => {
  it('lê dos cabeçalhos do pedido', () => {
    const req = new Request('http://localhost/api/statements/x', {
      headers: {'x-forwarded-for': '203.0.113.9'}
    });
    expect(clientIp(req)).toBe('203.0.113.9');
  });

  it('null num pedido sem cabeçalhos de proxy', () => {
    expect(clientIp(new Request('http://localhost/api/statements/x'))).toBeNull();
  });
});
