/**
 * Máquina de estados do ciclo de vida de um projeto (spec secção 5).
 * Avanço estritamente sequencial; sem recuos (a correção de um projeto
 * publicado por engano faz-se por outra via, não implementada nesta fatia).
 */

export type ProjectStatus =
  | 'preparacao'
  | 'subscricao'
  | 'subscrito'
  | 'em_curso'
  | 'concluido'
  | 'liquidado';

const ORDER: ProjectStatus[] = [
  'preparacao',
  'subscricao',
  'subscrito',
  'em_curso',
  'concluido',
  'liquidado'
];

/** Estados válidos a seguir ao atual (apenas o imediatamente seguinte). */
export function nextStates(current: ProjectStatus): ProjectStatus[] {
  const i = ORDER.indexOf(current);
  const next = ORDER[i + 1];
  return next ? [next] : [];
}

export function canTransition(
  from: ProjectStatus,
  to: ProjectStatus
): boolean {
  return nextStates(from).includes(to);
}
