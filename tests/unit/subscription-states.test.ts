import {describe, it, expect} from 'vitest';
import {
  canTransition,
  nextStates,
  isTerminal,
  type SubscriptionStatus
} from '@/lib/subscriptions/states';

describe('máquina de estados da subscrição', () => {
  it('avança sequencialmente', () => {
    expect(canTransition('interesse', 'contrato_assinado')).toBe(true);
    expect(canTransition('contrato_assinado', 'fundos_confirmados')).toBe(true);
  });

  it('permite cancelar de interesse e contrato_assinado', () => {
    expect(canTransition('interesse', 'cancelada')).toBe(true);
    expect(canTransition('contrato_assinado', 'cancelada')).toBe(true);
  });

  it('não permite cancelar fundos confirmados', () => {
    expect(canTransition('fundos_confirmados', 'cancelada')).toBe(false);
  });

  it('não permite saltar nem recuar', () => {
    expect(canTransition('interesse', 'fundos_confirmados')).toBe(false);
    expect(canTransition('contrato_assinado', 'interesse')).toBe(false);
  });

  it('estados terminais', () => {
    expect(isTerminal('fundos_confirmados')).toBe(true);
    expect(isTerminal('cancelada')).toBe(true);
    expect(isTerminal('interesse')).toBe(false);
  });

  it('nextStates para progressão no back-office (exclui cancelada)', () => {
    expect(nextStates('interesse')).toEqual<SubscriptionStatus[]>([
      'contrato_assinado'
    ]);
    expect(nextStates('contrato_assinado')).toEqual<SubscriptionStatus[]>([
      'fundos_confirmados'
    ]);
    expect(nextStates('fundos_confirmados')).toEqual([]);
  });
});
