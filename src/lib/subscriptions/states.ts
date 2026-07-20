/**
 * Máquina de estados da subscrição (spec 5.4). Progressão sequencial gerida
 * pelo staff; cancelamento possível antes de os fundos estarem confirmados.
 */

export type SubscriptionStatus =
  | 'interesse'
  | 'contrato_assinado'
  | 'fundos_confirmados'
  | 'cancelada';

const FORWARD: Record<SubscriptionStatus, SubscriptionStatus | null> = {
  interesse: 'contrato_assinado',
  contrato_assinado: 'fundos_confirmados',
  fundos_confirmados: null,
  cancelada: null
};

/** Estado seguinte na progressão (não inclui 'cancelada'). */
export function nextStates(current: SubscriptionStatus): SubscriptionStatus[] {
  const next = FORWARD[current];
  return next ? [next] : [];
}

export function isTerminal(s: SubscriptionStatus): boolean {
  return s === 'fundos_confirmados' || s === 'cancelada';
}

export function canTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus
): boolean {
  if (to === 'cancelada') {
    return from === 'interesse' || from === 'contrato_assinado';
  }
  return nextStates(from).includes(to);
}
