import {describe, it, expect} from 'vitest';
import {withAuditActor, getAuditActor} from '@/lib/audit/actor';

/**
 * O envelope do ator.
 *
 * Duas propriedades, e a segunda é a razão de o mecanismo ser este e não um
 * mais barato: cadeias concorrentes nunca se veem umas às outras. Num registo
 * de auditoria, atribuir a escrita à pessoa errada é pior do que não atribuir —
 * e foi por isso que `AsyncLocalStorage.enterWith()` ficou de fora (medido com
 * um servidor HTTP real: 4 em 5 pedidos concorrentes ficavam com o ator do
 * vizinho).
 */

const ANA = '22222222-2222-4222-8222-222222222222';
const BRUNO = '33333333-3333-4333-8333-333333333333';

async function work(): Promise<string | null> {
  await new Promise((r) => setTimeout(r, 5));
  await Promise.resolve();
  return getAuditActor();
}

describe('envelope do ator', () => {
  it('acompanha a cadeia de await lá dentro', async () => {
    expect(await withAuditActor(ANA, work)).toBe(ANA);
  });

  it('cadeias concorrentes não se misturam', async () => {
    const [a, b] = await Promise.all([
      withAuditActor(ANA, work),
      withAuditActor(BRUNO, work)
    ]);
    expect(a).toBe(ANA);
    expect(b).toBe(BRUNO);
  });

  it('fora do envelope não há ator', async () => {
    await withAuditActor(ANA, work);
    expect(getAuditActor()).toBeNull();
  });
});
