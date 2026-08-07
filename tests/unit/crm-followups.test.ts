import {describe, it, expect} from 'vitest';
import {earliestFollowupByLead} from '@/lib/crm/service';
import type {FollowupRow} from '@/lib/crm/service';

/**
 * O board mostra UM alerta por cartão, por isso o que interessa de cada lead é
 * o follow-up pendente mais antigo. Testa-se aqui e não na integração porque a
 * função é pura — a query que a alimenta já tem os seus testes.
 */

function row(leadId: string, dueAt: string): FollowupRow {
  return {id: `a-${leadId}-${dueAt}`, leadId, leadName: leadId, type: 'chamada', body: '', dueAt};
}

describe('earliestFollowupByLead', () => {
  it('sem follow-ups devolve mapa vazio', () => {
    expect(earliestFollowupByLead([]).size).toBe(0);
  });

  it('guarda um follow-up por lead', () => {
    const map = earliestFollowupByLead([
      row('a', '2026-08-01T09:00:00Z'),
      row('b', '2026-08-03T09:00:00Z')
    ]);
    expect(map.get('a')).toBe('2026-08-01T09:00:00Z');
    expect(map.get('b')).toBe('2026-08-03T09:00:00Z');
  });

  it('com vários do mesmo lead fica o MAIS ANTIGO', () => {
    const map = earliestFollowupByLead([
      row('a', '2026-08-10T09:00:00Z'),
      row('a', '2026-08-02T09:00:00Z'),
      row('a', '2026-08-20T09:00:00Z')
    ]);
    expect(map.get('a')).toBe('2026-08-02T09:00:00Z');
  });

  it('não depende da ordem de entrada', () => {
    // A query devolve ordenado, mas a função não pode contar com isso: um
    // `order by` mudado do outro lado passaria a mostrar a data errada.
    const asc = earliestFollowupByLead([
      row('a', '2026-08-02T09:00:00Z'),
      row('a', '2026-08-10T09:00:00Z')
    ]);
    const desc = earliestFollowupByLead([
      row('a', '2026-08-10T09:00:00Z'),
      row('a', '2026-08-02T09:00:00Z')
    ]);
    expect(asc.get('a')).toBe(desc.get('a'));
    expect(asc.get('a')).toBe('2026-08-02T09:00:00Z');
  });
});
